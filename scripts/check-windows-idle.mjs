import fs from 'node:fs';
import vm from 'node:vm';

const workflow = fs.readFileSync('.github/workflows/build-windows.yml', 'utf8');
function extract(name, end) {
  const marker = `cat > desktop/${name} <<'${end}'\n`;
  const start = workflow.indexOf(marker);
  if (start < 0) throw new Error(`Missing generated desktop/${name} heredoc.`);
  const bodyStart = start + marker.length;
  const finish = workflow.indexOf(`\n          ${end}\n`, bodyStart);
  if (finish < 0) throw new Error(`Unterminated desktop/${name} heredoc.`);
  return workflow.slice(bodyStart, finish).split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
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
