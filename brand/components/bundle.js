/* @ds-bundle: {"format":4,"namespace":"Quaestor","components":[{"name":"Button"},{"name":"StatusBadge"},{"name":"Amount"},{"name":"BudgetMeter"},{"name":"AgentNode"},{"name":"ToolResult"}]} */
(function () {
  var R = window.React, h = R.createElement;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }
  function fmt(n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  var LABELS = { active: 'Active', reserved: 'Reserved', rejected: 'Rejected', frozen: 'Frozen' };
  var NUMERALS = ['I', 'II', 'III', 'IV'];
  function Button(p) {
    var variant = p.variant || 'secondary', size = p.size || 'md';
    var rest = Object.assign({}, p); delete rest.variant; delete rest.size; delete rest.className;
    return h('button', Object.assign({ type: 'button' }, rest, { className: cx('q-btn', 'q-btn-' + variant, size === 'sm' && 'q-btn-sm', p.className) }), p.children);
  }
  function StatusBadge(p) {
    var s = p.status || 'active';
    return h('span', { className: 'q-badge q-badge-' + s }, p.children || LABELS[s]);
  }
  function Amount(p) {
    var size = p.size || 'md', unit = p.unit === undefined ? 'USDC' : p.unit;
    return h('span', { className: cx('q-amount', 'q-amount-' + size, p.tone && 'q-tone-' + p.tone) }, fmt(p.value), unit ? h('span', { className: 'q-amount-unit' }, unit) : null);
  }
  function BudgetMeter(p) {
    var limit = Math.max(p.limit || 0, 0.000001), spent = p.spent || 0, reserved = p.reserved || 0;
    var over = spent + reserved > limit;
    var sp = Math.min(spent / limit, 1) * 100, rs = Math.max(Math.min(reserved / limit, 1 - sp / 100), 0) * 100;
    var avail = Math.max(limit - spent - reserved, 0);
    return h('div', { className: cx('q-meter', over && 'q-meter-over') },
      h('div', { className: 'q-meter-track', role: 'img', 'aria-label': fmt(spent) + ' spent, ' + fmt(reserved) + ' reserved, ' + fmt(avail) + ' available of ' + fmt(p.limit) + ' USDC' },
        h('div', { className: 'q-meter-spent', style: { width: sp + '%' } }),
        h('div', { className: 'q-meter-reserved', style: { width: rs + '%' } })),
      p.legend === false ? null : h('div', { className: 'q-meter-legend' },
        h('span', null, h('i', { className: 'q-meter-key', style: { background: over ? 'var(--cinnabar)' : 'var(--verdigris)' } }), 'Spent ', h('b', null, fmt(spent))),
        h('span', null, h('i', { className: 'q-meter-key', style: { background: 'var(--aurum)' } }), 'Reserved ', h('b', null, fmt(reserved))),
        h('span', null, h('i', { className: 'q-meter-key', style: { background: 'var(--surface-sunken)', boxShadow: 'inset 0 0 0 1px var(--line-strong)' } }), 'Available ', h('b', null, fmt(avail)))));
  }
  function AgentNode(p) {
    var d = Math.min(Math.max(p.depth || 1, 1), 4), status = p.status || 'active';
    return h('div', { className: cx('q-node', status === 'frozen' && 'q-node-frozen', p.selected && 'q-node-selected') },
      h('div', { className: 'q-node-depth', 'aria-label': 'Depth ' + d }, NUMERALS[d - 1]),
      h('div', { className: 'q-node-head' },
        h('div', null, h('div', { className: 'q-node-name' }, p.name), p.address ? h('div', { className: 'q-node-addr' }, p.address) : null),
        h(StatusBadge, { status: status })),
      h('div', { className: 'q-node-limit' }, h('span', null, 'Limit'), h(Amount, { value: p.limit })),
      h(BudgetMeter, { limit: p.limit, spent: p.spent, reserved: p.reserved }));
  }
  function Mark(p) {
    return h('svg', { viewBox: '0 0 64 64', className: p.className, 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor' },
      h('circle', { cx: 28, cy: 28, r: 19, strokeWidth: 6 }),
      h('path', { d: 'M41 41 L50 50 M50 50 H59 M50 50 V59', strokeWidth: 5, strokeLinecap: 'square' }),
      h('rect', { x: 56, y: 47, width: 6, height: 6, fill: 'currentColor', stroke: 'none' }),
      h('rect', { x: 47, y: 56, width: 6, height: 6, fill: 'currentColor', stroke: 'none' }));
  }
  function ToolResult(p) {
    var s = p.status || 'active', rows = p.rows || [];
    return h('section', { className: cx('q-tool', s === 'rejected' && 'q-tool-rejected', s === 'frozen' && 'q-tool-frozen') },
      h('div', { className: 'q-tool-head' }, h(Mark, { className: 'q-tool-mark' }), h('span', { className: 'q-tool-title' }, p.title), h(StatusBadge, { status: s }, p.statusLabel)),
      p.message ? h('p', { className: 'q-tool-msg' }, p.message) : null,
      rows.length ? h('dl', { className: 'q-tool-rows' }, rows.map(function (r, i) {
        return [h('dt', { key: 'k' + i }, r.label), h('dd', { key: 'v' + i }, typeof r.value === 'number' ? h(Amount, { value: r.value, tone: r.tone }) : r.value)];
      })) : null,
      p.meter ? h(BudgetMeter, p.meter) : null,
      (p.signature || p.meta) ? h('div', { className: 'q-tool-foot' }, h('span', null, p.signature || ''), h('span', null, p.meta || '')) : null);
  }
  window.Quaestor = Object.assign(window.Quaestor || {}, { Button: Button, StatusBadge: StatusBadge, Amount: Amount, BudgetMeter: BudgetMeter, AgentNode: AgentNode, ToolResult: ToolResult, Mark: Mark, formatUSDC: fmt });
})();
