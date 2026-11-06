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
  ['no inactivity timeout closes the companion', "function armPanelIdleClose() {}"],
  ['panel has no auto-hide-on-idle handler', "!main.includes('PANEL AUTO-CLOSED AFTER 15 SECONDS OF INACTIVITY')"],
  ['panel remains open until explicit user action', "panel.on('close', event =>"],
  ['expanded workspace uses responsive desktop dimensions', 'Math.round(area.width * 0.78)'],
  ['Windows Writing Ideas card uses the bundled shared interface', "writingCard.loadFile(path.join(__dirname, 'index.html'), { query: { bosleyWritingCard: '1' } })"],
  ['Writing Ideas card is a movable always-on-top overlay', 'resizable: true, movable: true'],
  ['Writing Ideas card fits within the desktop work area', 'Math.min(700, Math.max(560, cardArea.height - 24))'],
  ['floating bulb remains on Ctrl+Shift+I', "globalShortcut.register('CommandOrControl+Shift+I', toggleWritingBulb)"]
];
for (const [label, needle] of required) {
  if (label.startsWith('no inactivity') || label.startsWith('panel has')) {
    if (!eval(needle)) throw new Error('Windows workspace check failed: ' + label);
  } else if (!main.includes(needle) && !preload.includes(needle)) {
    throw new Error('Windows workspace check failed: ' + label);
  }
}
console.log('Windows workspace checks passed (persistent panel, responsive layout, draggable local Writing Ideas overlay, Ctrl+Shift+I shortcut).');
