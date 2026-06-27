/**
 * CRM Intake Dashboard — data model, UI, charts, export
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'crm_intake_dashboard_v2';

  const COURSE_COLORS = {
    'UG': '#2E4DA7',
    'PG': '#375623',
    'Ext. Mgmt': '#7B2D9E',
    'Top-Up': '#C55A11',
    'PDP': '#888888',
    'Ext. Top-Up': '#444444'
  };

  const DEFAULT_COLUMNS = [
    { id: 'category', label: 'Course Category', type: 'text', locked: true },
    { id: 'total', label: 'Total Applications', type: 'number', computed: true },
    { id: 'valid', label: 'Valid Applications', type: 'number', computed: true },
    { id: 'active', label: 'Active Applications', type: 'number' },
    { id: 'onHold', label: 'On Hold', type: 'number' },
    { id: 'withdrawn', label: 'Withdrawn', type: 'number' },
    { id: 'rejected', label: 'Rejected', type: 'number' }
  ];

  const DEFAULT_DAILY_COLUMNS = [
    { id: 'active', label: 'Active', type: 'number' },
    { id: 'onHold', label: 'On Hold', type: 'number' },
    { id: 'withdrawn', label: 'Withdrawn', type: 'number' },
    { id: 'rejected', label: 'Rejected', type: 'number' },
    { id: 'total', label: 'Total', type: 'computed' },
    { id: 'valid', label: 'Valid', type: 'computed' }
  ];

  const DEFAULT_COURSES = [
    { category: 'UG', active: 1315, onHold: 249, withdrawn: 520, rejected: 8 },
    { category: 'PG', active: 380, onHold: 114, withdrawn: 161, rejected: 10 },
    { category: 'Ext. Mgmt', active: 110, onHold: 52, withdrawn: 45, rejected: 3 },
    { category: 'Top-Up', active: 55, onHold: 3, withdrawn: 15, rejected: 0 },
    { category: 'PDP', active: 5, onHold: 0, withdrawn: 1, rejected: 0 }
  ];

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  let state = { intakes: [], currentIntakeId: null, compareIntakeIds: [] };
  let charts = {};
  let dragColIndex = null;
  let dragDailyColIndex = null;

  function uid() {
    return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function getCurrentIntake() {
    return state.intakes.find(i => i.id === state.currentIntakeId) || null;
  }

  function intakePeriodLabel(startMonth, startYear) {
    const sm = Number(startMonth);
    const sy = Number(startYear);
    const em = sm === 11 ? 0 : sm + 1;
    const ey = sm === 11 ? sy + 1 : sy;
    return `16 ${MONTHS[sm].slice(0, 3)} ${sy} – 15 ${MONTHS[em].slice(0, 3)} ${ey}`;
  }

  function calcMetrics(data) {
    const active = num(data.active);
    const onHold = num(data.onHold);
    const withdrawn = num(data.withdrawn);
    const rejected = num(data.rejected);
    const total = active + onHold + withdrawn + rejected;
    const valid = total - withdrawn - rejected;
    return { active, onHold, withdrawn, rejected, total, valid };
  }

  function applyMetricsToCourse(course) {
    const m = calcMetrics(course);
    course.total = m.total;
    course.valid = m.valid;
    return m;
  }

  function createIntake(overrides = {}) {
    const now = new Date();
    const courses = JSON.parse(JSON.stringify(overrides.courses || DEFAULT_COURSES));
    courses.forEach(applyMetricsToCourse);
    return {
      id: uid(),
      name: overrides.name || 'May to Aug intake report',
      startMonth: overrides.startMonth ?? 4,
      startYear: overrides.startYear ?? now.getFullYear(),
      reportDate: overrides.reportDate || formatDate(now),
      preparedBy: overrides.preparedBy || 'AlwsHappy',
      columns: JSON.parse(JSON.stringify(DEFAULT_COLUMNS)),
      dailyLogColumns: JSON.parse(JSON.stringify(DEFAULT_DAILY_COLUMNS)),
      courses,
      dailyLog: [],
      ...overrides
    };
  }

  function createDailyEntry(intake, date) {
    const courses = {};
    intake.courses.forEach(c => {
      courses[c.category] = { active: 0, onHold: 0, withdrawn: 0, rejected: 0 };
    });
    return { id: uid(), date: date || new Date().toISOString().slice(0, 10), notes: '', courses };
  }

  function ensureDailyEntryCourses(intake, entry) {
    if (!entry.courses) entry.courses = {};
    if (!entry.id) entry.id = uid();
    intake.courses.forEach(c => {
      if (!entry.courses[c.category]) {
        entry.courses[c.category] = { active: 0, onHold: 0, withdrawn: 0, rejected: 0 };
      }
    });
  }

  function formatDate(d) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function num(v) {
    const n = parseFloat(String(v ?? '').replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function fmt(n) {
    return Number(n).toLocaleString('en-GB');
  }

  function courseColor(name) {
    return COURSE_COLORS[name] || '#666';
  }

  function getCourseValue(course, colId) {
    if (colId === 'category') return course.category || '';
    applyMetricsToCourse(course);
    return num(course[colId]);
  }

  function setCourseValue(course, colId, value) {
    if (colId === 'category') course.category = String(value).trim();
    else if (colId !== 'total' && colId !== 'valid') course[colId] = num(value);
    applyMetricsToCourse(course);
  }

  function computeTotals(intake) {
    intake.courses.forEach(applyMetricsToCourse);
    const numericCols = intake.columns.filter(c => c.type === 'number').map(c => c.id);
    const totals = {};
    numericCols.forEach(id => { totals[id] = 0; });
    intake.courses.forEach(c => {
      numericCols.forEach(id => { totals[id] += getCourseValue(c, id); });
    });
    return totals;
  }

  function getKpis(intake) {
    const t = computeTotals(intake);
    return {
      total: t.total || 0,
      valid: t.valid || 0,
      active: t.active || 0,
      withdrawn: t.withdrawn || 0,
      rejected: t.rejected || 0,
      onHold: t.onHold || 0
    };
  }

  function syncCoursesFromDailyLog(intake) {
    if (!intake.dailyLog.length) return false;
    const sorted = [...intake.dailyLog].filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date));
    if (!sorted.length) return false;
    const latest = sorted[sorted.length - 1];
    intake.courses.forEach(c => {
      const d = latest.courses?.[c.category];
      if (d) {
        c.active = num(d.active);
        c.onHold = num(d.onHold);
        c.withdrawn = num(d.withdrawn);
        c.rejected = num(d.rejected);
        applyMetricsToCourse(c);
      }
    });
    return true;
  }

  function migrateIntake(intake) {
    if (!intake.dailyLogColumns) {
      intake.dailyLogColumns = JSON.parse(JSON.stringify(DEFAULT_DAILY_COLUMNS));
    }
    if (!intake.columns) intake.columns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
    intake.columns.forEach(col => {
      if (col.id === 'valid' || col.id === 'total') col.computed = true;
    });

    if (intake.dailyLog?.length && intake.dailyLog[0].course !== undefined) {
      const byDate = {};
      intake.dailyLog.forEach(e => {
        const key = e.date || uid();
        if (!byDate[key]) byDate[key] = { id: uid(), date: e.date || '', notes: e.notes || '', courses: {} };
        byDate[key].courses[e.course] = {
          active: num(e.active), onHold: num(e.onHold), withdrawn: num(e.withdrawn), rejected: num(e.rejected)
        };
      });
      intake.dailyLog = Object.values(byDate);
    }

    intake.dailyLog = intake.dailyLog || [];
    intake.dailyLog.forEach(e => ensureDailyEntryCourses(intake, e));
    intake.courses.forEach(applyMetricsToCourse);

    if (intake.preparedBy === 'Ashish') intake.preparedBy = 'AlwsHappy';
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) raw = localStorage.getItem('crm_intake_dashboard_v1');
      if (raw) {
        state = JSON.parse(raw);
        if (!state.intakes?.length) throw new Error('empty');
        state.intakes.forEach(migrateIntake);
        if (!state.compareIntakeIds?.length) {
          state.compareIntakeIds = state.intakes.map(i => i.id);
        }
      } else throw new Error('none');
    } catch {
      const intake = createIntake();
      state = { intakes: [intake], currentIntakeId: intake.id, compareIntakeIds: [intake.id] };
      saveState();
    }
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2600);
  }

  function hasDailyLog(intake) {
    return intake.dailyLog.length > 0;
  }

  function refreshSummaryFromDaily(intake) {
    if (hasDailyLog(intake)) syncCoursesFromDailyLog(intake);
    else intake.courses.forEach(applyMetricsToCourse);
  }

  /* ─── Render: intake selector ─── */
  function renderIntakeBar() {
    const intake = getCurrentIntake();
    if (!intake) return;

    document.getElementById('intakeSelect').innerHTML = state.intakes.map(i =>
      `<option value="${i.id}" ${i.id === state.currentIntakeId ? 'selected' : ''}>${i.name} (${intakePeriodLabel(i.startMonth, i.startYear)})</option>`
    ).join('');

    document.getElementById('intakeName').value = intake.name;
    document.getElementById('startMonth').value = intake.startMonth;
    document.getElementById('startYear').value = intake.startYear;
    document.getElementById('reportDate').value = intake.reportDate;
    document.getElementById('preparedBy').value = intake.preparedBy;
    document.getElementById('intakePeriod').textContent = intakePeriodLabel(intake.startMonth, intake.startYear);
  }

  function renderExcelReport() {
    const intake = getCurrentIntake();
    if (!intake) return;

    refreshSummaryFromDaily(intake);
    const kpis = getKpis(intake);
    const fromDaily = hasDailyLog(intake);

    document.getElementById('excelTitle').value = intake.name;
    document.getElementById('excelMeta').value = `Report Date: ${intake.reportDate} · Prepared by: ${intake.preparedBy}`;
    document.getElementById('dailyAutoBadge').textContent = fromDaily ? 'Summary from latest daily report' : 'Enter daily reports below';

    document.getElementById('sidebarActive').textContent = fmt(kpis.active);
    document.getElementById('sidebarWithdrawn').textContent = fmt(kpis.withdrawn);
    document.getElementById('sidebarOnHold').textContent = fmt(kpis.onHold);
    document.getElementById('sidebarRejected').textContent = fmt(kpis.rejected);

    ['total','valid','active','withdrawn','rejected'].forEach(k => {
      const el = document.getElementById('kpi_' + k);
      if (el) el.textContent = fmt(kpis[k]);
    });

    renderDataTable(intake, fromDaily);
    renderDailyLog(intake);
  }

  function renderDataTable(intake, readOnlyFromDaily) {
    const thead = document.getElementById('dataTableHead');
    const tbody = document.getElementById('dataTableBody');

    thead.innerHTML = '<tr>' + intake.columns.map((col, idx) => {
      const cls = col.type === 'number' ? 'r' : '';
      const actions = col.locked ? '' :
        `<span class="col-actions"><button type="button" class="col-btn" data-action="edit-col" data-idx="${idx}" title="Rename">✎</button><button type="button" class="col-btn" data-action="del-col" data-idx="${idx}" title="Remove">×</button></span>`;
      return `<th class="${cls}" draggable="true" data-col-idx="${idx}">${col.label}${col.computed ? ' ⚡' : ''}${actions}</th>`;
    }).join('') + '<th style="width:70px;background:#334">Actions</th></tr>';

    tbody.innerHTML = intake.courses.map((course, rowIdx) => {
      applyMetricsToCourse(course);
      const cells = intake.columns.map(col => {
        const val = getCourseValue(course, col.id);
        const cls = col.type === 'number' ? 'r' : '';
        const isComputed = col.computed || col.id === 'valid' || col.id === 'total';
        const ro = readOnlyFromDaily || isComputed;

        if (col.id === 'category') {
          const dot = `<span class="cat-dot" style="background:${courseColor(course.category)}"></span>`;
          return `<td class="${cls}">${dot}<input type="text" data-row="${rowIdx}" data-col="${col.id}" data-old-cat="${escapeAttr(course.category)}" value="${escapeAttr(course.category)}"></td>`;
        }
        if (ro) {
          return `<td class="${cls}"><input type="text" readonly class="computed" value="${fmt(val)}"></td>`;
        }
        return `<td class="${cls}"><input type="number" min="0" data-row="${rowIdx}" data-col="${col.id}" value="${val}"></td>`;
      }).join('');
      return `<tr data-row="${rowIdx}">${cells}<td><div class="row-actions"><button type="button" data-action="del-row" data-row="${rowIdx}">Delete</button></div></td></tr>`;
    }).join('');

    const totals = computeTotals(intake);
    const gtCells = intake.columns.map(col => {
      const cls = col.type === 'number' ? 'r' : '';
      if (col.id === 'category') return `<td><strong>GRAND TOTAL</strong></td>`;
      if (col.type === 'number') return `<td class="${cls}">${fmt(totals[col.id] || 0)}</td>`;
      return '<td></td>';
    }).join('');
    tbody.innerHTML += `<tr class="grand-total">${gtCells}<td></td></tr>`;

    bindTableEvents(intake, readOnlyFromDaily);
    bindColumnDrag(intake, '#dataTableHead', 'columns');
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  }

  function bindTableEvents(intake, readOnlyFromDaily) {
    document.querySelectorAll('#dataTableBody input[data-col="category"]').forEach(inp => {
      inp.addEventListener('change', () => {
        const row = num(inp.dataset.row);
        const oldCat = inp.dataset.oldCat;
        const newCat = inp.value.trim();
        if (oldCat && newCat && oldCat !== newCat) {
          intake.dailyLog.forEach(e => {
            if (e.courses?.[oldCat]) {
              e.courses[newCat] = e.courses[oldCat];
              delete e.courses[oldCat];
            }
          });
          inp.dataset.oldCat = newCat;
        }
        setCourseValue(intake.courses[row], 'category', newCat);
        saveState();
        refreshAll();
      });
    });

    if (!readOnlyFromDaily) {
      document.querySelectorAll('#dataTableBody input:not([readonly]):not([data-col="category"])').forEach(inp => {
        inp.addEventListener('change', () => {
          const row = num(inp.dataset.row);
          const col = inp.dataset.col;
          setCourseValue(intake.courses[row], col, inp.value);
          saveState();
          refreshAll();
        });
      });
    }

    document.querySelectorAll('[data-action="del-row"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = num(btn.dataset.row);
        const cat = intake.courses[row].category;
        if (intake.courses.length <= 1) { toast('Keep at least one course row'); return; }
        intake.courses.splice(row, 1);
        intake.dailyLog.forEach(e => { if (e.courses) delete e.courses[cat]; });
        saveState();
        refreshAll();
      });
    });

    document.querySelectorAll('[data-action="edit-col"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = num(btn.dataset.idx);
        const col = intake.columns[idx];
        const label = prompt('Column name:', col.label);
        if (label?.trim()) {
          col.label = label.trim();
          saveState();
          refreshAll();
        }
      });
    });

    document.querySelectorAll('[data-action="del-col"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = num(btn.dataset.idx);
        const col = intake.columns[idx];
        if (col.locked || col.computed) return;
        if (!confirm(`Remove column "${col.label}"?`)) return;
        intake.columns.splice(idx, 1);
        intake.courses.forEach(c => { delete c[col.id]; });
        saveState();
        refreshAll();
      });
    });
  }

  function bindColumnDrag(intake, headSelector, columnsKey) {
    const headers = document.querySelectorAll(`${headSelector} th[draggable="true"]`);
    headers.forEach(th => {
      th.addEventListener('dragstart', e => {
        if (columnsKey === 'columns') dragColIndex = num(th.dataset.colIdx);
        else dragDailyColIndex = num(th.dataset.dailyColIdx);
        th.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      th.addEventListener('dragend', () => {
        th.classList.remove('dragging');
        document.querySelectorAll(`${headSelector} th`).forEach(h => h.classList.remove('drag-over'));
      });
      th.addEventListener('dragover', e => { e.preventDefault(); th.classList.add('drag-over'); });
      th.addEventListener('dragleave', () => th.classList.remove('drag-over'));
      th.addEventListener('drop', e => {
        e.preventDefault();
        const cols = intake[columnsKey];
        const fromIdx = columnsKey === 'columns' ? dragColIndex : dragDailyColIndex;
        const toIdx = num(columnsKey === 'columns' ? th.dataset.colIdx : th.dataset.dailyColIdx);
        if (fromIdx === null || fromIdx === toIdx) return;
        const [moved] = cols.splice(fromIdx, 1);
        cols.splice(toIdx, 0, moved);
        if (columnsKey === 'columns') dragColIndex = null;
        else dragDailyColIndex = null;
        saveState();
        refreshAll();
        toast('Column order updated');
      });
    });
  }

  function renderDailyLog(intake) {
    const thead = document.getElementById('dailyLogHead');
    const tbody = document.getElementById('dailyLogBody');
    const cols = intake.dailyLogColumns;

    thead.innerHTML = `<tr>
      <th rowspan="2" style="vertical-align:bottom">Date</th>
      <th rowspan="2" style="vertical-align:bottom">Course</th>
      ${cols.map((col, idx) => {
        const cls = col.type === 'number' || col.type === 'computed' ? 'r draggable' : 'draggable';
        const actions = col.type === 'computed' ? '' :
          `<span class="col-actions"><button type="button" class="col-btn daily-col-edit" data-idx="${idx}" title="Rename">✎</button><button type="button" class="col-btn daily-col-del" data-idx="${idx}" title="Remove">×</button></span>`;
        return `<th class="${cls}" draggable="true" data-daily-col-idx="${idx}">${col.label}${col.type === 'computed' ? ' ⚡' : ''}${actions}</th>`;
      }).join('')}
      <th rowspan="2" style="vertical-align:bottom">Notes</th>
      <th rowspan="2" style="vertical-align:bottom;width:50px"></th>
    </tr>`;

    if (!intake.dailyLog.length) {
      tbody.innerHTML = `<tr><td colspan="${cols.length + 4}" style="text-align:center;color:#888;padding:1.2rem">No daily reports yet — click "+ Add Daily Report" or paste from Google Sheets</td></tr>`;
      bindDailyHeadEvents(intake);
      return;
    }

    let html = '';
    intake.dailyLog.forEach((entry, entryIdx) => {
      ensureDailyEntryCourses(intake, entry);
      const courseNames = intake.courses.map(c => c.category);
      const rowCount = courseNames.length;

      courseNames.forEach((cat, ci) => {
        const data = entry.courses[cat] || {};
        const m = calcMetrics(data);
        const isFirst = ci === 0;
        html += `<tr class="${isFirst ? 'daily-group-start' : ''} daily-course-row">`;
        if (isFirst) {
          html += `<td class="date-cell" rowspan="${rowCount}"><input type="date" data-entry="${entryIdx}" data-field="date" value="${entry.date || ''}"></td>`;
        }
        html += `<td class="course-label"><span class="cat-dot" style="background:${courseColor(cat)}"></span>${escapeAttr(cat)}</td>`;

        cols.forEach(col => {
          if (col.type === 'computed') {
            const v = col.id === 'total' ? m.total : m.valid;
            html += `<td class="r computed">${fmt(v)}</td>`;
          } else {
            html += `<td class="r"><input type="number" min="0" data-entry="${entryIdx}" data-course="${escapeAttr(cat)}" data-field="${col.id}" value="${num(data[col.id])}"></td>`;
          }
        });

        if (isFirst) {
          html += `<td class="notes-cell" rowspan="${rowCount}"><input type="text" data-entry="${entryIdx}" data-field="notes" value="${escapeAttr(entry.notes || '')}" placeholder="Optional notes"></td>`;
          html += `<td class="date-cell" rowspan="${rowCount}"><button type="button" class="btn btn-sm btn-outline" data-del-entry="${entryIdx}">×</button></td>`;
        }
        html += '</tr>';
      });
    });

    tbody.innerHTML = html;

    tbody.querySelectorAll('input[data-entry]').forEach(inp => {
      inp.addEventListener('change', () => {
        const entryIdx = num(inp.dataset.entry);
        const entry = intake.dailyLog[entryIdx];
        if (inp.dataset.course && inp.dataset.field) {
          if (!entry.courses[inp.dataset.course]) entry.courses[inp.dataset.course] = {};
          entry.courses[inp.dataset.course][inp.dataset.field] = num(inp.value);
        } else {
          entry[inp.dataset.field] = inp.value;
        }
        saveState();
        syncCoursesFromDailyLog(intake);
        refreshAll();
      });
    });

    tbody.querySelectorAll('[data-del-entry]').forEach(btn => {
      btn.addEventListener('click', () => {
        intake.dailyLog.splice(num(btn.dataset.delEntry), 1);
        saveState();
        syncCoursesFromDailyLog(intake);
        refreshAll();
      });
    });

    bindDailyHeadEvents(intake);
    bindColumnDrag(intake, '#dailyLogHead', 'dailyLogColumns');
  }

  function bindDailyHeadEvents(intake) {
    document.querySelectorAll('.daily-col-edit').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const col = intake.dailyLogColumns[num(btn.dataset.idx)];
        if (col.type === 'computed') return;
        const label = prompt('Column name:', col.label);
        if (label?.trim()) { col.label = label.trim(); saveState(); refreshAll(); }
      });
    });
    document.querySelectorAll('.daily-col-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = num(btn.dataset.idx);
        const col = intake.dailyLogColumns[idx];
        if (col.type === 'computed') return;
        if (!confirm(`Remove column "${col.label}"?`)) return;
        intake.dailyLogColumns.splice(idx, 1);
        saveState();
        refreshAll();
      });
    });
  }

  /* ─── Paste from Google Sheets ─── */
  function normalizeCourseName(s) {
    const t = String(s).trim();
    const map = {
      'ug': 'UG', 'pg': 'PG', 'top-up': 'Top-Up', 'topup': 'Top-Up', 'top up': 'Top-Up',
      'ext. mgmt': 'Ext. Mgmt', 'ext mgmt': 'Ext. Mgmt', 'pdp': 'PDP', 'ext. top-up': 'Ext. Top-Up'
    };
    return map[t.toLowerCase()] || t;
  }

  function parseDateCell(v) {
    if (!v) return '';
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const yr = m[3].length === 2 ? 2000 + num(m[3]) : num(m[3]);
      return `${yr}-${String(num(m[2])).padStart(2,'0')}-${String(num(m[1])).padStart(2,'0')}`;
    }
    return s;
  }

  function findMetricIndex(headers, names) {
    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i] || '').toLowerCase();
      if (names.some(n => h.includes(n))) return i;
    }
    return -1;
  }

  function parsePastedDailyData(text, intake) {
    const rows = text.trim().split(/\r?\n/).map(r => r.split('\t'));
    if (!rows.length) return [];

    const courseNames = intake.courses.map(c => c.category);
    const entries = [];
    let headerRow = null;
    let lastDate = '';

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map(c => String(c ?? '').trim());
      if (!row.some(Boolean)) continue;
      const lower = row.join(' ').toLowerCase();
      if (lower.includes('active') && (lower.includes('hold') || lower.includes('withdrawn') || lower.includes('course') || lower.includes('date'))) {
        headerRow = row;
        continue;
      }

      // Determine the course category in this row to see if it's a valid course row
      let cat = '';
      if (headerRow) {
        const courseCol = findMetricIndex(headerRow, ['course', 'category', 'level']);
        if (courseCol >= 0 && row[courseCol] !== undefined) {
          cat = normalizeCourseName(row[courseCol]);
        }
      } else if (row.length >= 2) {
        cat = normalizeCourseName(row[1]);
      }
      const isValidCourseRow = courseNames.includes(cat);

      let dateVal = parseDateCell(row[0]);
      let looksLikeDate = dateVal && (row[0].includes('/') || row[0].includes('-') || !isNaN(Date.parse(row[0])));

      // Carry forward the last seen date if date cell is empty in a valid course row
      if (!looksLikeDate && lastDate && isValidCourseRow) {
        dateVal = lastDate;
        looksLikeDate = true;
      } else if (looksLikeDate) {
        lastDate = dateVal;
      }

      if (headerRow && looksLikeDate) {
        const courseCol = findMetricIndex(headerRow, ['course', 'category', 'level']);
        const activeCol = findMetricIndex(headerRow, ['active']);
        const onHoldCol = findMetricIndex(headerRow, ['on hold', 'onhold', 'hold']);
        const withdrawnCol = findMetricIndex(headerRow, ['withdrawn', 'withdraw']);
        const rejectedCol = findMetricIndex(headerRow, ['rejected', 'reject']);

        if (courseCol >= 0) {
          const cat = normalizeCourseName(row[courseCol]);
          if (!courseNames.includes(cat)) continue;
          const entry = { id: uid(), date: dateVal, notes: '', courses: {} };
          entry.courses[cat] = {
            active: activeCol >= 0 ? num(row[activeCol]) : 0,
            onHold: onHoldCol >= 0 ? num(row[onHoldCol]) : 0,
            withdrawn: withdrawnCol >= 0 ? num(row[withdrawnCol]) : 0,
            rejected: rejectedCol >= 0 ? num(row[rejectedCol]) : 0
          };
          entries.push(entry);
          continue;
        }

        const entry = { id: uid(), date: dateVal, notes: '', courses: {} };
        courseNames.forEach(cat => {
          const prefix = cat.toLowerCase();
          let found = false;
          const metrics = { active: 0, onHold: 0, withdrawn: 0, rejected: 0 };
          for (let c = 0; c < headerRow.length; c++) {
            const h = String(headerRow[c] || '').toLowerCase();
            if (h.includes(prefix) || h.startsWith(cat.toLowerCase())) {
              found = true;
              if (h.includes('active')) metrics.active = num(row[c]);
              else if (h.includes('hold')) metrics.onHold = num(row[c]);
              else if (h.includes('withdraw')) metrics.withdrawn = num(row[c]);
              else if (h.includes('reject')) metrics.rejected = num(row[c]);
            }
          }
          if (found) {
            entry.courses[cat] = metrics;
          }
        });
        if (Object.keys(entry.courses).length > 0) {
          entries.push(entry);
        }
        continue;
      }

      if (looksLikeDate && row.length >= 3) {
        const cat = normalizeCourseName(row[1]);
        if (courseNames.includes(cat)) {
          const entry = { id: uid(), date: dateVal, notes: '', courses: {} };
          entry.courses[cat] = {
            active: num(row[2]), onHold: num(row[3]), withdrawn: num(row[4]), rejected: num(row[5])
          };
          if (row[6]) entry.notes = row[6];
          entries.push(entry);
        } else {
          const entry = { id: uid(), date: dateVal, notes: '', courses: {} };
          courseNames.forEach((c, ci) => {
            const base = 1 + ci * 4;
            if (row[base] !== undefined) {
              entry.courses[c] = {
                active: num(row[base]), onHold: num(row[base + 1]), withdrawn: num(row[base + 2]), rejected: num(row[base + 3])
              };
            }
          });
          if (Object.keys(entry.courses).length > 0) {
            entries.push(entry);
          }
        }
      }
    }

    const merged = {};
    entries.forEach(e => {
      const key = e.date || uid();
      if (!merged[key]) {
        merged[key] = { ...e, courses: { ...e.courses } };
      } else {
        Object.keys(e.courses).forEach(cat => {
          merged[key].courses[cat] = { ...e.courses[cat] };
        });
        if (e.notes) {
          merged[key].notes = merged[key].notes ? merged[key].notes + '; ' + e.notes : e.notes;
        }
      }
    });

    return Object.values(merged);
  }

  function importPaste() {
    const text = document.getElementById('pasteArea').value.trim();
    if (!text) { toast('Paste your CRM data first'); return; }
    const intake = getCurrentIntake();
    const parsed = parsePastedDailyData(text, intake);
    if (!parsed.length) { toast('Could not parse paste — check format'); return; }

    parsed.forEach(p => {
      const existing = intake.dailyLog.find(e => e.date === p.date);
      if (existing) {
        ensureDailyEntryCourses(intake, existing);
        Object.keys(p.courses).forEach(cat => {
          existing.courses[cat] = { ...p.courses[cat] };
        });
        if (p.notes) {
          existing.notes = existing.notes ? existing.notes + '; ' + p.notes : p.notes;
        }
      } else {
        ensureDailyEntryCourses(intake, p);
        intake.dailyLog.push(p);
      }
    });

    intake.dailyLog.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    syncCoursesFromDailyLog(intake);
    saveState();
    document.getElementById('pasteArea').value = '';
    refreshAll();
    toast(`Imported ${parsed.length} daily report(s)`);
  }

  /* ─── Dashboard charts ─── */
  function renderDashboard() {
    const intake = getCurrentIntake();
    if (!intake) return;

    refreshSummaryFromDaily(intake);
    const kpis = getKpis(intake);
    const labels = intake.courses.map(c => c.category);
    const colors = labels.map(courseColor);

    document.getElementById('dashTitle').textContent = intake.name;
    document.getElementById('dashMeta').textContent = `${intakePeriodLabel(intake.startMonth, intake.startYear)} · Report: ${intake.reportDate} · ${intake.preparedBy}`;

    const kpiMap = [
      { id: 'dk_total', val: kpis.total, bg: '#1F3864', sub: '100% of pipeline' },
      { id: 'dk_valid', val: kpis.valid, bg: '#2E4DA7', sub: 'auto: Total − Withdrawn − Rejected' },
      { id: 'dk_active', val: kpis.active, bg: '#375623', sub: 'excl. on hold' },
      { id: 'dk_onhold', val: kpis.onHold, bg: '#E36C09', sub: kpis.total ? ((kpis.onHold / kpis.total) * 100).toFixed(1) + '% of total' : '0%' },
      { id: 'dk_withdrawn', val: kpis.withdrawn, bg: '#7030A0', sub: kpis.total ? ((kpis.withdrawn / kpis.total) * 100).toFixed(1) + '% of total' : '0%' },
      { id: 'dk_rejected', val: kpis.rejected, bg: '#C00000', sub: kpis.total ? ((kpis.rejected / kpis.total) * 100).toFixed(1) + '% of total' : '0%' }
    ];

    kpiMap.forEach(k => {
      const el = document.getElementById(k.id);
      if (el) {
        el.style.background = k.bg;
        el.querySelector('.val').textContent = fmt(k.val);
        el.querySelector('.sub').textContent = k.sub;
      }
    });

    destroyCharts();

    const chartOpts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 11 } } } }
    };

    charts.statusBar = new Chart(document.getElementById('statusBar'), {
      type: 'bar',
      data: {
        labels: ['Total', 'Valid', 'Active', 'On Hold', 'Withdrawn', 'Rejected'],
        datasets: [{
          label: 'Applications',
          data: [kpis.total, kpis.valid, kpis.active, kpis.onHold, kpis.withdrawn, kpis.rejected],
          backgroundColor: ['#1F3864', '#2E4DA7', '#375623', '#E36C09', '#7030A0', '#C00000'],
          borderRadius: 6
        }]
      },
      options: { ...chartOpts, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });

    charts.stackedBar = new Chart(document.getElementById('stackedBar'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Active', data: intake.courses.map(c => c.active), backgroundColor: '#375623' },
          { label: 'On Hold', data: intake.courses.map(c => c.onHold), backgroundColor: '#E36C09' },
          { label: 'Withdrawn', data: intake.courses.map(c => c.withdrawn), backgroundColor: '#7030A0' },
          { label: 'Rejected', data: intake.courses.map(c => c.rejected), backgroundColor: '#C00000' }
        ]
      },
      options: { ...chartOpts, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
    });

    charts.catPie = new Chart(document.getElementById('catPie'), {
      type: 'doughnut',
      data: {
        labels: labels.map((l, i) => `${l} (${kpis.total ? ((intake.courses[i].total / kpis.total) * 100).toFixed(1) : 0}%)`),
        datasets: [{ data: intake.courses.map(c => c.total), backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
      },
      options: { ...chartOpts, plugins: { legend: { position: 'bottom' } } }
    });

    charts.statusPie = new Chart(document.getElementById('statusPie'), {
      type: 'doughnut',
      data: {
        labels: ['Active', 'On Hold', 'Withdrawn', 'Rejected'],
        datasets: [{
          data: [kpis.active, kpis.onHold, kpis.withdrawn, kpis.rejected],
          backgroundColor: ['#375623', '#E36C09', '#7030A0', '#C00000'],
          borderWidth: 2, borderColor: '#fff'
        }]
      },
      options: { ...chartOpts, plugins: { legend: { position: 'bottom' } } }
    });

    charts.courseBar = new Chart(document.getElementById('courseBar'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Total', data: intake.courses.map(c => c.total), backgroundColor: '#2E4DA7' },
          { label: 'Valid', data: intake.courses.map(c => c.valid), backgroundColor: '#375623' }
        ]
      },
      options: { ...chartOpts, scales: { y: { beginAtZero: true } } }
    });

    renderDailyTrendChart(intake, chartOpts);
    renderMultiIntakeComparison(chartOpts);
    renderBreakdownTable(intake, kpis);
  }

  function renderDailyTrendChart(intake, chartOpts) {
    if (!intake.dailyLog.length) {
      document.getElementById('dailyChartSection').style.display = 'none';
      return;
    }
    const byDate = {};
    intake.dailyLog.forEach(e => {
      if (!e.date) return;
      let total = 0, active = 0;
      Object.values(e.courses || {}).forEach(d => {
        const m = calcMetrics(d);
        total += m.total;
        active += m.active;
      });
      byDate[e.date] = { total, active };
    });
    const dates = Object.keys(byDate).sort();
    charts.dailyLine = new Chart(document.getElementById('dailyLine'), {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          { label: 'Total', data: dates.map(d => byDate[d].total), borderColor: '#1F3864', tension: 0.3, fill: false },
          { label: 'Active', data: dates.map(d => byDate[d].active), borderColor: '#375623', tension: 0.3, fill: false },
          { label: 'Valid', data: dates.map(d => byDate[d].total - (byDate[d].total - byDate[d].active)), borderColor: '#2E4DA7', tension: 0.3, fill: false, hidden: true }
        ]
      },
      options: { ...chartOpts, scales: { y: { beginAtZero: true } } }
    });
    document.getElementById('dailyChartSection').style.display = 'block';
  }

  function renderMultiIntakeComparison(chartOpts) {
    const container = document.getElementById('compareIntakeChecks');
    container.innerHTML = state.intakes.map(i => {
      const checked = state.compareIntakeIds.includes(i.id) ? 'checked' : '';
      return `<label><input type="checkbox" data-compare-id="${i.id}" ${checked}> ${escapeAttr(i.name)} (${intakePeriodLabel(i.startMonth, i.startYear)})</label>`;
    }).join('');

    container.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.compareId;
        if (cb.checked) {
          if (!state.compareIntakeIds.includes(id)) state.compareIntakeIds.push(id);
        } else {
          state.compareIntakeIds = state.compareIntakeIds.filter(x => x !== id);
        }
        saveState();
        renderMultiIntakeComparison(chartOpts);
      });
    });

    const selected = state.intakes.filter(i => state.compareIntakeIds.includes(i.id));
    if (!selected.length) {
      if (charts.intakeCompare) charts.intakeCompare.destroy();
      return;
    }

    const labels = selected.map(i => i.name.length > 18 ? i.name.slice(0, 16) + '…' : i.name);
    const datasets = [
      { label: 'Total', data: [], backgroundColor: '#1F3864' },
      { label: 'Valid', data: [], backgroundColor: '#2E4DA7' },
      { label: 'Active', data: [], backgroundColor: '#375623' },
      { label: 'On Hold', data: [], backgroundColor: '#E36C09' },
      { label: 'Withdrawn', data: [], backgroundColor: '#7030A0' },
      { label: 'Rejected', data: [], backgroundColor: '#C00000' }
    ];

    selected.forEach(intake => {
      refreshSummaryFromDaily(intake);
      const k = getKpis(intake);
      datasets[0].data.push(k.total);
      datasets[1].data.push(k.valid);
      datasets[2].data.push(k.active);
      datasets[3].data.push(k.onHold);
      datasets[4].data.push(k.withdrawn);
      datasets[5].data.push(k.rejected);
    });

    if (charts.intakeCompare) charts.intakeCompare.destroy();
    charts.intakeCompare = new Chart(document.getElementById('intakeCompare'), {
      type: 'bar',
      data: { labels, datasets },
      options: {
        ...chartOpts,
        scales: { x: { stacked: false }, y: { beginAtZero: true } },
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  function renderBreakdownTable(intake, kpis) {
    const tbody = document.getElementById('breakdownBody');
    tbody.innerHTML = intake.courses.map(c => {
      applyMetricsToCourse(c);
      const activePct = c.total ? ((c.active / c.total) * 100).toFixed(1) : '0.0';
      return `<tr>
        <td><span class="cat-dot" style="background:${courseColor(c.category)}"></span>${c.category}</td>
        <td class="r">${fmt(c.total)}</td>
        <td class="r">${fmt(c.valid)}</td>
        <td class="r">${fmt(c.active)}</td>
        <td class="r">${fmt(c.onHold)}</td>
        <td class="r">${fmt(c.withdrawn)}</td>
        <td class="r">${fmt(c.rejected)}</td>
        <td class="r">${activePct}%</td>
      </tr>`;
    }).join('') + `<tr class="grand-total">
      <td>GRAND TOTAL</td>
      <td class="r">${fmt(kpis.total)}</td>
      <td class="r">${fmt(kpis.valid)}</td>
      <td class="r">${fmt(kpis.active)}</td>
      <td class="r">${fmt(kpis.onHold)}</td>
      <td class="r">${fmt(kpis.withdrawn)}</td>
      <td class="r">${fmt(kpis.rejected)}</td>
      <td class="r">${kpis.total ? ((kpis.active / kpis.total) * 100).toFixed(1) : 0}%</td>
    </tr>`;
  }

  function destroyCharts() {
    Object.values(charts).forEach(c => c?.destroy());
    charts = {};
  }

  function chartToImage(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    return canvas.toDataURL('image/png', 1.0);
  }

  /* ─── Export Excel ─── */
  function exportExcel() {
    const intake = getCurrentIntake();
    if (!intake || typeof XLSX === 'undefined') { toast('Excel library not loaded'); return; }

    refreshSummaryFromDaily(intake);
    const kpis = getKpis(intake);
    const wb = XLSX.utils.book_new();
    const rows = [];

    rows.push([]);
    rows.push([intake.name, null, null, null, null, null, null, null, null, null, null, null, 'Status Component', 'Total Applications']);
    rows.push([`Report Date: ${intake.reportDate} · Prepared by: ${intake.preparedBy}`, null, null, null, null, null, null, null, null, null, null, null, 'Active', kpis.active]);
    rows.push([`Intake Period: ${intakePeriodLabel(intake.startMonth, intake.startYear)}`, null, null, null, null, null, null, null, null, null, null, null, 'Withdrawn', kpis.withdrawn]);
    rows.push([null, null, null, null, null, null, null, null, null, null, null, null, 'On Hold', kpis.onHold]);
    rows.push(['TOTAL APPS', null, 'VALID APPS', null, 'ACTIVE APPS', null, 'WITHDRAWN', null, 'REJECTED', null, null, null, 'Rejected', kpis.rejected]);
    rows.push([kpis.total, null, kpis.valid, null, kpis.active, null, kpis.withdrawn, null, kpis.rejected]);
    rows.push([]);
    rows.push(intake.columns.map(c => c.label));
    intake.courses.forEach(c => {
      applyMetricsToCourse(c);
      rows.push(intake.columns.map(col => getCourseValue(c, col.id)));
    });
    const totals = computeTotals(intake);
    rows.push(intake.columns.map(col => {
      if (col.id === 'category') return 'GRAND TOTAL';
      if (col.type === 'number') return totals[col.id] || 0;
      return '';
    }));

    if (intake.dailyLog.length) {
      rows.push([]);
      rows.push(['Daily Application Log']);
      const dcols = intake.dailyLogColumns.filter(c => c.type !== 'computed');
      rows.push(['Date', 'Course', ...dcols.map(c => c.label), 'Total', 'Valid', 'Notes']);
      intake.dailyLog.forEach(e => {
        intake.courses.forEach(c => {
          const d = e.courses?.[c.category] || {};
          const m = calcMetrics(d);
          rows.push([e.date, c.category, ...dcols.map(col => num(d[col.id])), m.total, m.valid, e.notes || '']);
        });
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Summary Dashboard');
    XLSX.writeFile(wb, `${sanitizeFilename(intake.name)}.xlsx`);
    toast('Excel file downloaded');
  }

  function sanitizeFilename(s) {
    return String(s).replace(/[<>:"/\\|?*]/g, '_').slice(0, 80) || 'crm_report';
  }

  async function exportPptx() {
    const intake = getCurrentIntake();
    if (!intake || typeof PptxGenJS === 'undefined') { toast('PPTX library not loaded'); return; }

    refreshSummaryFromDaily(intake);
    const kpis = getKpis(intake);
    const pptx = new PptxGenJS();
    pptx.author = intake.preparedBy;
    pptx.title = intake.name;
    pptx.layout = 'LAYOUT_WIDE';

    const navy = '1F3864';
    const slide1 = pptx.addSlide();
    slide1.background = { color: navy };
    slide1.addText(intake.name, { x: 0.5, y: 1.2, w: 12, h: 1, fontSize: 32, color: 'FFFFFF', bold: true });
    slide1.addText(`${intakePeriodLabel(intake.startMonth, intake.startYear)}`, { x: 0.5, y: 2.2, w: 12, h: 0.5, fontSize: 18, color: 'B8C9E8' });
    slide1.addText(`Report Date: ${intake.reportDate}  ·  Prepared by: ${intake.preparedBy}`, { x: 0.5, y: 2.8, w: 12, h: 0.4, fontSize: 14, color: 'CCCCCC' });

    const slide2 = pptx.addSlide();
    slide2.addText('Application Summary', { x: 0.4, y: 0.3, w: 12, h: 0.6, fontSize: 22, color: navy, bold: true });
    const kpiData = [
      [{ text: 'Total', options: { fill: { color: '1F3864' }, color: 'FFFFFF' } }, { text: 'Valid', options: { fill: { color: '2E4DA7' }, color: 'FFFFFF' } }, { text: 'Active', options: { fill: { color: '375623' }, color: 'FFFFFF' } }, { text: 'On Hold', options: { fill: { color: 'E36C09' }, color: 'FFFFFF' } }, { text: 'Withdrawn', options: { fill: { color: '7030A0' }, color: 'FFFFFF' } }, { text: 'Rejected', options: { fill: { color: 'C00000' }, color: 'FFFFFF' } }],
      [fmt(kpis.total), fmt(kpis.valid), fmt(kpis.active), fmt(kpis.onHold), fmt(kpis.withdrawn), fmt(kpis.rejected)]
    ];
    slide2.addTable(kpiData, { x: 0.4, y: 1, w: 12.5, colW: [2, 2, 2, 2, 2.5, 2], fontSize: 16, border: { type: 'solid', color: 'CCCCCC' }, align: 'center' });

    const chartIds = [
      { id: 'statusBar', title: 'Status Overview' },
      { id: 'stackedBar', title: 'Course-wise Breakdown' },
      { id: 'catPie', title: 'Category Distribution' },
      { id: 'statusPie', title: 'Status Mix' },
      { id: 'intakeCompare', title: 'Multi-Intake Comparison' }
    ];

    for (const ch of chartIds) {
      const img = chartToImage(ch.id);
      if (!img) continue;
      const slide = pptx.addSlide();
      slide.addText(ch.title, { x: 0.4, y: 0.25, w: 12, h: 0.5, fontSize: 20, color: navy, bold: true });
      slide.addImage({ data: img, x: 0.5, y: 0.9, w: 12, h: 5.5 });
    }

    const slideTable = pptx.addSlide();
    slideTable.addText('Course-wise Full Breakdown', { x: 0.4, y: 0.25, w: 12, h: 0.5, fontSize: 20, color: navy, bold: true });
    const tableRows = [
      [{ text: 'Course', options: { fill: { color: '415B8C' }, color: 'FFFFFF', bold: true } }, { text: 'Total', options: { fill: { color: '415B8C' }, color: 'FFFFFF', bold: true } }, { text: 'Valid', options: { fill: { color: '415B8C' }, color: 'FFFFFF', bold: true } }, { text: 'Active', options: { fill: { color: '415B8C' }, color: 'FFFFFF', bold: true } }, { text: 'On Hold', options: { fill: { color: '415B8C' }, color: 'FFFFFF', bold: true } }, { text: 'Withdrawn', options: { fill: { color: '415B8C' }, color: 'FFFFFF', bold: true } }, { text: 'Rejected', options: { fill: { color: '415B8C' }, color: 'FFFFFF', bold: true } }]
    ];
    intake.courses.forEach(c => {
      applyMetricsToCourse(c);
      tableRows.push([c.category, fmt(c.total), fmt(c.valid), fmt(c.active), fmt(c.onHold), fmt(c.withdrawn), fmt(c.rejected)]);
    });
    tableRows.push([{ text: 'GRAND TOTAL', options: { bold: true } }, fmt(kpis.total), fmt(kpis.valid), fmt(kpis.active), fmt(kpis.onHold), fmt(kpis.withdrawn), fmt(kpis.rejected)]);
    slideTable.addTable(tableRows, { x: 0.3, y: 0.9, w: 12.7, fontSize: 11, border: { type: 'solid', color: 'DDDDDD' }, align: 'center' });

    await pptx.writeFile({ fileName: `${sanitizeFilename(intake.name)}.pptx` });
    toast('PowerPoint file downloaded');
  }

  function importExcel(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        const intake = getCurrentIntake();
        let headerRowIdx = -1;
        for (let i = 0; i < data.length; i++) {
          if (String(data[i][0]).toLowerCase().includes('course category')) {
            headerRowIdx = i;
            break;
          }
        }
        if (headerRowIdx < 0) { toast('Could not find course table in Excel'); return; }

        const headers = data[headerRowIdx];
        const newCols = headers.filter(Boolean).map((h, i) => {
          const label = String(h).trim();
          const existing = DEFAULT_COLUMNS.find(c => c.label.toLowerCase() === label.toLowerCase());
          if (existing) return { ...existing };
          return { id: 'col_' + i + '_' + label.replace(/\W/g, '').toLowerCase(), label, type: i === 0 ? 'text' : 'number' };
        });

        const courses = [];
        for (let r = headerRowIdx + 1; r < data.length; r++) {
          const row = data[r];
          if (!row || !row[0]) continue;
          const cat = String(row[0]).trim();
          if (cat.toUpperCase() === 'GRAND TOTAL') break;
          const course = {};
          newCols.forEach((col, ci) => setCourseValue(course, col.id, row[ci] ?? (col.type === 'number' ? 0 : '')));
          courses.push(course);
        }

        if (data[1]?.[0]) intake.name = String(data[1][0]);
        if (data[2]?.[0]) {
          const m = String(data[2][0]).match(/Report Date:\s*([^·]+)/);
          if (m) intake.reportDate = m[1].trim();
          const p = String(data[2][0]).match(/Prepared by:\s*(.+)/);
          if (p) intake.preparedBy = p[1].trim();
        }

        intake.columns = newCols;
        if (courses.length) intake.courses = courses;
        intake.courses.forEach(applyMetricsToCourse);
        saveState();
        refreshAll();
        toast('Excel imported successfully');
      } catch (err) {
        toast('Import failed: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function refreshAll() {
    renderIntakeBar();
    renderExcelReport();
    if (document.getElementById('tab-dashboard').classList.contains('active')) {
      renderDashboard();
    }
  }

  function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabId));
    if (tabId === 'dashboard') requestAnimationFrame(() => renderDashboard());
  }

  function bindEvents() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    document.getElementById('intakeSelect').addEventListener('change', e => {
      state.currentIntakeId = e.target.value;
      saveState();
      refreshAll();
    });

    ['intakeName', 'startMonth', 'startYear', 'reportDate', 'preparedBy'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        const intake = getCurrentIntake();
        if (!intake) return;
        intake.name = document.getElementById('intakeName').value;
        intake.startMonth = num(document.getElementById('startMonth').value);
        intake.startYear = num(document.getElementById('startYear').value);
        intake.reportDate = document.getElementById('reportDate').value;
        intake.preparedBy = document.getElementById('preparedBy').value;
        saveState();
        refreshAll();
      });
    });

    document.getElementById('excelTitle').addEventListener('change', e => {
      const intake = getCurrentIntake();
      intake.name = e.target.value;
      document.getElementById('intakeName').value = e.target.value;
      saveState();
    });

    document.getElementById('excelMeta').addEventListener('change', e => {
      const intake = getCurrentIntake();
      const val = e.target.value;
      const dm = val.match(/Report Date:\s*([^·]+)/);
      const pm = val.match(/Prepared by:\s*(.+)/);
      if (dm) intake.reportDate = dm[1].trim();
      if (pm) intake.preparedBy = pm[1].trim();
      saveState();
      renderIntakeBar();
    });

    document.getElementById('btnAddCourse').addEventListener('click', () => {
      const intake = getCurrentIntake();
      const newCourse = { category: 'New Course' };
      intake.columns.forEach(col => {
        if (col.type === 'number' && !col.computed) newCourse[col.id] = 0;
      });
      applyMetricsToCourse(newCourse);
      intake.courses.push(newCourse);
      intake.dailyLog.forEach(e => {
        ensureDailyEntryCourses(intake, e);
        e.courses[newCourse.category] = { active: 0, onHold: 0, withdrawn: 0, rejected: 0 };
      });
      saveState();
      refreshAll();
      toast('Course added — appears in daily log too');
    });

    document.getElementById('btnAddColumn').addEventListener('click', () => {
      const label = prompt('New column name:', 'Docs Pending');
      if (!label?.trim()) return;
      const intake = getCurrentIntake();
      const id = 'col_' + uid();
      intake.columns.push({ id, label: label.trim(), type: 'number' });
      intake.courses.forEach(c => { c[id] = 0; });
      saveState();
      refreshAll();
    });

    document.getElementById('btnAddDaily').addEventListener('click', () => {
      const intake = getCurrentIntake();
      intake.dailyLog.push(createDailyEntry(intake));
      intake.dailyLog.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      syncCoursesFromDailyLog(intake);
      saveState();
      refreshAll();
      toast('Daily report added with all courses (UG, PG, Top-Up, …)');
    });

    document.getElementById('btnAddDailyColumn').addEventListener('click', () => {
      const label = prompt('New daily log column name:', 'Docs Pending');
      if (!label?.trim()) return;
      const intake = getCurrentIntake();
      intake.dailyLogColumns.splice(intake.dailyLogColumns.length - 2, 0, {
        id: 'col_' + uid(), label: label.trim(), type: 'number'
      });
      saveState();
      refreshAll();
    });

    document.getElementById('btnSyncFromDaily').addEventListener('click', () => {
      const intake = getCurrentIntake();
      if (!intake.dailyLog.length) { toast('No daily reports to sync'); return; }
      syncCoursesFromDailyLog(intake);
      saveState();
      refreshAll();
      toast('Summary updated from latest daily report');
    });

    document.getElementById('btnImportPaste').addEventListener('click', importPaste);
    document.getElementById('btnClearPaste').addEventListener('click', () => {
      document.getElementById('pasteArea').value = '';
    });

    document.getElementById('pasteArea').addEventListener('paste', () => {
      setTimeout(() => {}, 50);
    });

    document.getElementById('btnNewIntake').addEventListener('click', () => {
      document.getElementById('newIntakeModal').classList.add('open');
    });

    document.getElementById('btnCancelIntake').addEventListener('click', () => {
      document.getElementById('newIntakeModal').classList.remove('open');
    });

    document.getElementById('btnCreateIntake').addEventListener('click', () => {
      const name = document.getElementById('newIntakeName').value.trim() || 'New Intake Report';
      const sm = num(document.getElementById('newStartMonth').value);
      const sy = num(document.getElementById('newStartYear').value);
      const intake = createIntake({
        name, startMonth: sm, startYear: sy,
        courses: [
          { category: 'UG', active: 0, onHold: 0, withdrawn: 0, rejected: 0 },
          { category: 'PG', active: 0, onHold: 0, withdrawn: 0, rejected: 0 },
          { category: 'Top-Up', active: 0, onHold: 0, withdrawn: 0, rejected: 0 }
        ]
      });
      state.intakes.push(intake);
      state.compareIntakeIds.push(intake.id);
      state.currentIntakeId = intake.id;
      saveState();
      document.getElementById('newIntakeModal').classList.remove('open');
      refreshAll();
      toast('New intake created');
    });

    document.getElementById('btnDeleteIntake').addEventListener('click', () => {
      if (state.intakes.length <= 1) { toast('Cannot delete the only intake'); return; }
      if (!confirm('Delete this intake and all its data?')) return;
      state.intakes = state.intakes.filter(i => i.id !== state.currentIntakeId);
      state.compareIntakeIds = state.compareIntakeIds.filter(id => state.intakes.some(i => i.id === id));
      state.currentIntakeId = state.intakes[0].id;
      saveState();
      refreshAll();
    });

    document.getElementById('btnExportExcel').addEventListener('click', exportExcel);
    document.getElementById('btnExportPptx').addEventListener('click', exportPptx);
    document.getElementById('btnExportJson').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'crm_dashboard_backup.json';
      a.click();
      toast('JSON backup downloaded');
    });

    document.getElementById('btnImportExcel').addEventListener('click', () => {
      document.getElementById('fileImportExcel').click();
    });

    document.getElementById('fileImportExcel').addEventListener('change', e => {
      if (e.target.files[0]) importExcel(e.target.files[0]);
      e.target.value = '';
    });

    document.getElementById('btnImportJson').addEventListener('click', () => {
      document.getElementById('fileImportJson').click();
    });

    document.getElementById('fileImportJson').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          state = JSON.parse(ev.target.result);
          state.intakes.forEach(migrateIntake);
          saveState();
          refreshAll();
          toast('Backup restored');
        } catch { toast('Invalid JSON file'); }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    document.getElementById('btnResetSample').addEventListener('click', () => {
      if (!confirm('Reset current intake to May to Aug sample data?')) return;
      const intake = getCurrentIntake();
      Object.assign(intake, {
        name: 'May to Aug intake report',
        startMonth: 4,
        startYear: 2026,
        reportDate: '23 June 2026',
        preparedBy: 'AlwsHappy',
        columns: JSON.parse(JSON.stringify(DEFAULT_COLUMNS)),
        dailyLogColumns: JSON.parse(JSON.stringify(DEFAULT_DAILY_COLUMNS)),
        courses: JSON.parse(JSON.stringify(DEFAULT_COURSES)),
        dailyLog: []
      });
      intake.courses.forEach(applyMetricsToCourse);
      saveState();
      refreshAll();
      toast('Sample data restored');
    });
  }

  function initMonthYearSelects() {
    const sm = document.getElementById('startMonth');
    const nsm = document.getElementById('newStartMonth');
    MONTHS.forEach((m, i) => {
      sm.innerHTML += `<option value="${i}">${m}</option>`;
      nsm.innerHTML += `<option value="${i}">${m}</option>`;
    });
    const year = new Date().getFullYear();
    ['startYear', 'newStartYear'].forEach(id => {
      const el = document.getElementById(id);
      for (let y = year - 2; y <= year + 3; y++) {
        el.innerHTML += `<option value="${y}">${y}</option>`;
      }
    });
  }

  function init() {
    initMonthYearSelects();
    loadState();
    bindEvents();
    refreshAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
