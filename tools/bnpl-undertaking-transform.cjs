'use strict';

function edits() {
  const customerRoute = "    'customer-master': { title: 'Customer Master', renderer: 'customerMaster' },";
  const customerNav = "        { view: 'customer-master', label: 'Customer Master', icon: '👤', permissionView: 'dashboard' },";
  const customerRenderer = "    if (route.renderer === 'customerMaster') {";
  const viewPermission = "    var permissionView = child && child.permissionView ? child.permissionView : view;\n\n    if (view === 'undo'";
  const accessWrapper = "    auth.canView = function (view) {\n      if (view === 'customer-master'";
  const render = '    if (!mountedFromCurrentVelocity) root.innerHTML = viewManagementSection(currentView);';
  const logout = 'async function logout(){if(ZEZMS.cloudSync';
  return [
    [customerRoute, customerRoute + "\n    'bnpl-undertaking': { title: 'Buy Now, Pay Later Undertaking' },"],
    [customerNav, customerNav + "\n        { view: 'bnpl-undertaking', label: 'Buy Now, Pay Later', icon: '📄' },"],
    [customerRenderer, "    if (sectionKey === 'bnpl-undertaking') return ZEZMS.bnplUndertaking.viewHTML();\n\n" + customerRenderer],
    [viewPermission, "    if (view === 'bnpl-undertaking') return ZEZMS.bnplUndertaking?.canGenerate() === true;\n\n" + viewPermission],
    [accessWrapper, accessWrapper.replace("\n", "\n      if (view === 'bnpl-undertaking') return canOpenView(view);\n")],
    [render,
      "    if (!mountedFromCurrentVelocity && !(currentView === 'bnpl-undertaking' && root.querySelector('#bnplUndertakingForm'))) {\n      root.innerHTML = viewManagementSection(currentView);\n    }"],
    [logout, 'async function logout(){ZEZMS.bnplUndertaking?.clearForm();if(ZEZMS.cloudSync']
  ];
}

function transformBnplUndertaking(html, changes, source) {
  for (const [before, after] of changes) {
    if (html.split(before).length !== 2) throw Error('BNPL_UNDERTAKING_MARKER: ' + before);
    html = html.replace(before, () => after);
  }
  if (!source) return html;
  const bodyEnd = html.lastIndexOf('</body>');
  if (bodyEnd < 0) throw Error('BNPL_UNDERTAKING_BODY_MARKER');
  return html.slice(0, bodyEnd) + '<script data-zezms-bnpl-undertaking>\n' + source + '\n</script>' + html.slice(bodyEnd);
}

function withoutBnplUndertaking(html) {
  const moduleTag = /<script data-zezms-bnpl-undertaking>[\s\S]*?<\/script>/;
  if (!moduleTag.test(html)) return html;
  return transformBnplUndertaking(html.replace(moduleTag, ''), edits().map(([before, after]) => [after, before]));
}

module.exports = { edits, transformBnplUndertaking, withoutBnplUndertaking };
