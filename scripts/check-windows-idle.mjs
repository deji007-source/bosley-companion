import fs from 'node:fs';
import vm from 'node:vm';

const workflow = fs.readFileSync('.github/workflows/build-windows.yml', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
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
  ['Windows main workspace keeps its established responsive dimensions', 'Math.round(area.width * 0.78)'],
  ['Windows bulb appears on the shortcut and stays visible until explicitly toggled', 'writingBulbVisibleUntil = Number.POSITIVE_INFINITY'],
  ['Windows bulb shortcut hides the existing bulb without destroying its window', "writingBulb.hide();"],
  ['Windows bulb shortcut can reopen an existing hidden bulb', 'writingBulb.isVisible()'],
  ['Windows side dock restores compact established width', 'width:min(330px,calc(100vw - 470px))'],
  ['Windows side dock restores established desktop width and height', 'width:360px!important;height:min(600px,calc(100dvh - 24px))!important']
  ['Windows bulb remains assigned to Ctrl+Shift+I', "globalShortcut.register('CommandOrControl+Shift+I', toggleWritingBulb)"],
  ['Windows Writing Ideas card uses the bundled shared interface', "writingCard.loadFile(path.join(__dirname, 'index.html'), { query: { bosleyWritingCard: '1' } })"],
  ['Writing Ideas card is a movable always-on-top overlay', 'resizable: true, movable: true'],
  ['Writing Ideas card fits within the desktop work area', 'Math.min(700, Math.max(560, cardArea.height - 24))'],
  ['floating bulb remains on Ctrl+Shift+I', "globalShortcut.register('CommandOrControl+Shift+I', toggleWritingBulb)"]
];
for (const [label, needle] of required) {
  if (label.startsWith('no inactivity') || label.startsWith('panel has')) {
    const forbidden = label.startsWith('no inactivity') ? 'PANEL_AUTO-CLOSED AFTER 15 SECONDS OF INACTIVITY' : 'const PANEL_IDLE_TIMEOUT_MS = 15000;';
    if (main.includes(forbidden)) throw new Error('Windows workspace check failed: ' + label);
  } else if (label.startsWith('Windows side dock')) {
    if (!html.includes(needle)) throw new Error('Windows workspace check failed: ' + label);
  } else if (!main.includes(needle) && !preload.includes(needle)) {
    throw new Error('Windows workspace check failed: ' + label);
  }
}
if (!html.includes('width:min(330px,calc(100vw - 470px))') || !html.includes('width:360px!important;height:min(600px,calc(100dvh - 24px))!important') || html.includes('width:min(640px,calc(100vw - 24px))')) throw new Error('Windows side dock dimensions did not return to the compact established layout.');
console.log('Windows workspace checks passed (compact side dock, persistent panel, draggable local Writing Ideas overlay, Ctrl+Shift+I shortcut).');
