import fs from 'node:fs';
import vm from 'node:vm';

const workflow = fs.readFileSync('.github/workflows/build-windows.yml', 'utf8');
function extract(name, end) {
  // Workflow block-scalar commands are indented by YAML; locate the heredoc
  // command independent of that indentation, then extract through its terminator.
  const command = new RegExp('^[\\t ]*cat > desktop/' + name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + " <<'" + end + "'[\\t ]*$", 'm');
  const match = command.exec(workflow);
  if (!match) throw new Error(`Missing generated desktop/${name} heredoc.`);
  const bodyStart = match.index + match[0].length;
  const nextLine = workflow.indexOf('\\n', bodyStart);
  if (nextLine < 0) throw new Error(`Missing body for desktop/${name}.`);
  const terminator = new RegExp('^[\\t ]*' + end + '[\\t ]*$', 'm');
  terminator.lastIndex = nextLine + 1;
  const tail = workflow.slice(nextLine + 1);
  const endMatch = terminator.exec(tail);
  if (!endMatch) throw new Error(`Unterminated desktop/${name} heredoc.`);
  const raw = tail.slice(0, endMatch.index);
  const lines = raw.replace(/\\n$/, '').split('\\n');
  const indents = lines.filter(line => line.trim()).map(line => (line.match(/^[\\t ]*/) || [''])[0].length);
  const strip = indents.length ? Math.min(...indents) : 0;
  return lines.map(line => line.slice(Math.min(strip, (line.match(/^[\\t ]*/) || [''])[0].length))).join('\\n');
}

const main = extract('main.cjs', 'MAIN_EOF');
const preload = extract('preload.cjs', 'PRELOAD_EOF');
new vm.Script(main, { filename: 'desktop/main.cjs' });
new vm.Script(preload, { filename: 'desktop/preload.cjs' });

const required = [
  ['15-second timeout', 'const PANEL_IDLE_TIMEOUT_MS = 15000;'],
  ['idle timer is armed on panel show', "panel.on('show', () => armPanelIdleClose());"],
  ['idle timer is cleared when panel hides', "panel.on('hide', () => {"],
  ['idle timer cleanup exists', 'clearPanelIdleClose();'],
  ['only the panel renderer can reset its timer', 'event.sender === panel.webContents'],
  ['user activity is observed in preload', "['pointerdown','keydown','input','change','scroll','wheel','touchstart']"],
  ['idle timeout hides rather than destroys the panel', 'panel.hide();']
];
for (const [label, needle] of required) {
  if (!main.includes(needle) && !preload.includes(needle)) throw new Error(`Windows idle-close check failed: ${label}`);
}
console.log('Windows panel inactivity checks passed (15-second idle timeout, scoped activity events, hide/restore lifecycle).');
