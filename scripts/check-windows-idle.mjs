import fs from 'node:fs';
import vm from 'node:vm';

const workflow = fs.readFileSync('.github/workflows/build-windows.yml', 'utf8');
function extract(name, end) {
  // Match the shell heredoc without assuming YAML indentation.
  const marker = "cat > desktop/" + name + " <<'" + end + "'";
  const start = workflow.indexOf(marker);
  if (start < 0) throw new Error('Missing generated desktop/' + name + ' heredoc.');
  const bodyStart = workflow.indexOf('\n', start) + 1;
  if (!bodyStart) throw new Error('Missing body for desktop/' + name + '.');
  const tail = workflow.slice(bodyStart);
  const terminator = new RegExp('^[\\t ]*' + end + '[\\t ]*$', 'm');
  const finish = terminator.exec(tail);
  if (!finish) throw new Error('Unterminated desktop/' + name + ' heredoc.');
  const lines = tail.slice(0, finish.index).replace(/\n$/, '').split('\n');
  const indents = lines.filter(line => line.trim()).map(line => (line.match(/^[\t ]*/) || [''])[0].length);
  const strip = indents.length ? Math.min(...indents) : 0;
  return lines.map(line => line.slice(Math.min(strip, (line.match(/^[\t ]*/) || [''])[0].length))).join('\n');
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
  if (!main.includes(needle) && !preload.includes(needle)) throw new Error('Windows idle-close check failed: ' + label);
}
console.log('Windows panel inactivity checks passed (15-second idle timeout, scoped activity events, hide/restore lifecycle).');
