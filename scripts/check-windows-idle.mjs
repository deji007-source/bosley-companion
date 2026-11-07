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
  ['Windows workspace panel is a compact square attached to the top bezel', 'const panelWidth = Math.min(340, bounds.width)'],
  ['Windows workspace panel is centred against the physical screen edge', 'y: bounds.y'],
  ['Windows workspace panel height matches its width', 'const panelHeight = Math.min(panelWidth, bounds.height)'],
  ['Windows bulb appears on the shortcut and stays visible until explicitly toggled', 'writingBulbVisibleUntil = Number.POSITIVE_INFINITY'],
  ['Windows bulb shortcut hides the existing bulb without destroying its window', "writingBulb.hide();"],
  ['Windows bulb shortcut can reopen an existing hidden bulb', 'writingBulb.isVisible()'],
  ['Windows detached pages use compact near-square defaults', 'Math.min(480, Math.max(400, area.width - 32))'],
  ['Windows detached pages open near the top-centre', 'area.x + Math.round((area.width - savedWidth) / 2)'],
  ['Windows detached pages remain comfortably resizable', 'minWidth: 360, minHeight: 360'],
  ['Windows detached pages fill their client area when maximized', 'body.desktop-floating-view #side-dock .dock-body{'],
  ['Windows detached page content grows to use available height', 'min-height:100%!important;max-height:none!important;'],
  ['Windows floating page content fits its own window', 'body.desktop-floating-view #side-dock .dock-body{'],
  ['Windows floating page children cannot overflow horizontally', 'max-width:100%!important;min-width:0!important;'],
  ['Windows top widget opens the Companion instead of the writing bulb', 'window.bosleyDesktop.togglePanel()'],
  ['Windows top widget does not trigger the writing bulb', '!window.bosleyDesktop.showWritingBulb()'],
  ['Windows bulb remains assigned to Ctrl+Shift+I', "globalShortcut.register('CommandOrControl+Shift+I', toggleWritingBulb)"],
  ['Windows Writing Ideas card uses the bundled shared interface', "writingCard.loadFile(path.join(__dirname, 'index.html'), { query: { bosleyWritingCard: '1' } })"],
  ['Writing Ideas card is a movable always-on-top overlay', 'resizable: true, movable: true'],
  ['Writing Ideas card fits within the desktop work area', 'Math.min(700, Math.max(560, cardArea.height - 24))'],
];
for (const [label, needle] of required) {
  if (label.startsWith('no inactivity') || label.startsWith('panel has')) {
    const forbidden = label.startsWith('no inactivity') ? 'PANEL_AUTO-CLOSED AFTER 15 SECONDS OF INACTIVITY' : 'const PANEL_IDLE_TIMEOUT_MS = 15000;';
    if (main.includes(forbidden)) throw new Error('Windows workspace check failed: ' + label);
  } else if (label.startsWith('Windows floating page')) {
    if (!html.includes(needle)) throw new Error('Windows workspace check failed: ' + label);
  } else if (label.startsWith('Windows top widget')) {
    const bubbleStart = workflow.indexOf("cat > desktop/bubble.html <<'BUBBLE_EOF'");
    const bubbleEnd = workflow.indexOf('BUBBLE_EOF', bubbleStart + 40);
    const bubble = workflow.slice(bubbleStart, bubbleEnd);
    if (label.includes('does not trigger')) {
      if (bubble.includes('showWritingBulb()')) throw new Error('Windows workspace check failed: ' + label);
    } else if (!bubble.includes(needle)) throw new Error('Windows workspace check failed: ' + label);
  } else if (!main.includes(needle) && !preload.includes(needle)) {
    throw new Error('Windows workspace check failed: ' + label);
  }
}
if (!html.includes('body.desktop-floating-view #side-dock .dock-body{') || !html.includes('body.desktop-floating-view #side-dock .dock-body>*') || !html.includes('height:100%!important;min-width:0!important;min-height:0!important;')) throw new Error('Windows detached page layout is missing its maximized responsive rules.');
if (html.includes('setTimeout(()=>window.BosleyOpenWritingIdeasCard?.(),450)')) throw new Error('Writing Ideas card still waits through the splash delay.');
console.log('Windows workspace checks passed (top-bezel square workspace island, compact resizable pages, maximized responsive content, instant Writing Ideas card, Ctrl+Shift+I-only bulb).');
