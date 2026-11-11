(() => {
  'use strict';

  const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const percent = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const oneDecimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const $ = (id) => document.getElementById(id);
  let data = null;
  let benchmark = null;

  const fmt = (value) => number.format(Math.round(value));
  const fmtPct = (value) => `${percent.format(value)}%`;
  const fmtRub = (value) => `${fmt(value)} ₽`;
  const fmtCompactRub = (value) => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${value < 0 ? '−' : ''}${oneDecimal.format(abs / 1_000_000)} млн ₽`;
    if (abs >= 100_000) return `${value < 0 ? '−' : ''}${oneDecimal.format(abs / 1_000)} тыс. ₽`;
    return fmtRub(value);
  };
  const parse = (id) => {
    const el = $(id);
    if (!el || el.value.trim() === '') return null;
    const value = Number(el.value);
    return Number.isFinite(value) ? value : null;
  };
  const set = (id, value) => { if ($(id)) $(id).textContent = value; };
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function parsePair(value) {
    const match = String(value || '').trim().match(/^(\d+)\s*[/;:]\s*(\d+)$/);
    if (!match) return null;
    const numerator = Number(match[1]);
    const denominator = Number(match[2]);
    if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0 || numerator > denominator) return null;
    return { numerator, denominator, rate: numerator / denominator };
  }

  function renderStatus() {
    if ($('custdev-rows')) $('custdev-rows').innerHTML = data.custdev_presentation.rows.map(row => `<tr><td>${safe(row.hypothesis)}</td><td>${fmtPct(row.share * 100)}</td><td>${safe(row.decision)}</td></tr>`).join('');
    set('snapshot-cases', fmt(benchmark.cases));
    set('snapshot-tests', fmt(data.data_status.automated_python_tests));
    set('snapshot-interviews', fmt(data.data_status.bank_interviews_completed));
    set('banks-total', fmt(data.market.sector.banks_total));
    set('banks-universal', fmt(data.market.sector.universal_license));
    set('banks-basic', fmt(data.market.sector.basic_license));
    set('data-updated', `Обновление данных: ${new Date(`${data.updated_at}T12:00:00+03:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`);

    const total = benchmark.cases || 1;
    const benchmarkDate = benchmark.date ? new Date(`${benchmark.date}T12:00:00+03:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'не указана';
    set('benchmark-date', `Дата прогона: ${benchmarkDate} · seed ${benchmark.seed ?? '—'}`);
    set('benchmark-match', `${fmt(benchmark.exact_matches)} / ${fmt(benchmark.cases)}`);
    set('benchmark-precision', fmtPct(benchmark.precision * 100));
    set('benchmark-recall', fmtPct(benchmark.recall * 100));
    set('benchmark-false', `${fmt(benchmark.false_complete)} / ${fmt(benchmark.incomplete_cases)}`);
    set('benchmark-p95', oneDecimal.format(benchmark.engine_p95_ms));
    set('benchmark-complete', fmt(benchmark.complete_cases));
    set('benchmark-incomplete', fmt(benchmark.incomplete_cases));
    $('bar-complete').style.width = `${benchmark.complete_cases / total * 100}%`;
    $('bar-incomplete').style.width = `${benchmark.incomplete_cases / total * 100}%`;
  }

  function renderCompetitors() {
    const rows = data.competitors.map((item) => `
      <tr>
        <td>${safe(item.name)}<small>${safe(item.type)}</small></td>
        <td>${safe(item.document_capture)}<br><br>${safe(item.completeness)}</td>
        <td>${safe(item.workflow)}</td>
        <td>${safe(item.trace_angle)}<br><br><span class="table-muted">${safe(item.risk)}</span></td>
      </tr>`).join('');
    $('competitor-rows').innerHTML = rows;
  }

  function renderMetricTargets() {
    $('metric-targets').innerHTML = data.pilot_metrics.map((metric) => `
      <article class="metric-target">
        <header><strong>${safe(metric.name)}</strong><b>${safe(metric.target)}</b></header>
        <p>${safe(metric.formula)}</p>
        <small>${safe(metric.note)}</small>
      </article>`).join('');
  }

  function renderSources() {
    $('source-cards').innerHTML = data.sources.map((source) => `
      <article class="source-card">
        <strong>${safe(source.publisher)} · ${safe(source.title)}</strong>
        <span>Проверено ${safe(source.verified_on)}</span>
        <p>${safe(source.supports)} Ограничение: ${safe(source.limitation)}</p>
        <a href="${safe(source.url)}" target="_blank" rel="noopener">Открыть первоисточник ↗</a>
      </article>`).join('');
  }

  function updateQualification() {
    const ids = ['qual-process', 'qual-gap', 'qual-integration', 'qual-owner'];
    const values = ids.map(parse);
    if (values.some((value) => value === null)) {
      set('qualified-count', 'Не рассчитан');
      set('qualified-note', 'Заполните все четыре фильтра подтверждёнными значениями.');
      return;
    }
    if (values.some((value) => !Number.isInteger(value) || value < 0 || value > data.market.sector.banks_total) ||
        values[1] > values[0] || values[2] > values[1] || values[3] > values[2]) {
      set('qualified-count', 'Проверьте ввод');
      set('qualified-note', 'Каждый следующий этап не может быть больше предыдущего; диапазон — от 0 до 300.');
      return;
    }
    set('qualified-count', `${fmt(values[3])} из ${fmt(data.market.sector.banks_total)}`);
    set('qualified-note', `После фильтров: процесс ${fmt(values[0])} → пробел ${fmt(values[1])} → интеграция ${fmt(values[2])} → владелец и готовность ${fmt(values[3])}. Это результат ваших подтверждённых вводных, а не опубликованная оценка рынка.`);
  }

  function updatePilotMetrics() {
    const controlTime = parse('time-control');
    const traceTime = parse('time-trace');
    if (controlTime !== null && traceTime !== null && controlTime > 0 && traceTime >= 0) {
      const reduction = (controlTime - traceTime) / controlTime * 100;
      set('out-time', `${reduction > 0 ? '+' : ''}${oneDecimal.format(reduction)}%`);
      set('out-time-note', `Контроль ${oneDecimal.format(controlTime)} мин → Trace ${oneDecimal.format(traceTime)} мин. Отрицательное значение означает ухудшение.`);
    } else {
      set('out-time', 'Нет данных');
      set('out-time-note', 'Введите два замера в минутах; время должно быть больше нуля для контроля.');
    }

    const controlRepeat = parsePair($('repeat-control').value);
    const traceRepeat = parsePair($('repeat-trace').value);
    if (controlRepeat && traceRepeat && controlRepeat.denominator > 0) {
      const relative = controlRepeat.rate > 0 ? (controlRepeat.rate - traceRepeat.rate) / controlRepeat.rate * 100 : null;
      set('out-repeat', relative === null ? 'Нет базы' : `${relative > 0 ? '+' : ''}${oneDecimal.format(relative)}%`);
      set('out-repeat-note', `Контроль ${fmtPct(controlRepeat.rate * 100)} (${controlRepeat.numerator}/${controlRepeat.denominator}); Trace ${fmtPct(traceRepeat.rate * 100)} (${traceRepeat.numerator}/${traceRepeat.denominator}).`);
    } else {
      set('out-repeat', 'Нет данных');
      set('out-repeat-note', 'Введите числа в формате «повторные / завершённые» и учитывайте только полное 14-дневное окно.');
    }

    const tp = parse('quality-tp');
    const fp = parse('quality-fp');
    const fn = parse('quality-fn');
    if ([tp, fp, fn].every((value) => value !== null && Number.isInteger(value) && value >= 0) && (tp + fp > 0 || tp + fn > 0)) {
      const precisionValue = tp + fp > 0 ? tp / (tp + fp) * 100 : null;
      const recallValue = tp + fn > 0 ? tp / (tp + fn) * 100 : null;
      set('out-quality', `${precisionValue === null ? '—' : fmtPct(precisionValue)} / ${recallValue === null ? '—' : fmtPct(recallValue)}`);
      set('out-quality-note', `TP ${fmt(tp)} · FP ${fmt(fp)} · FN ${fmt(fn)}. Первое число — Precision, второе — Recall.`);
    } else {
      set('out-quality', 'Нет данных');
      set('out-quality-note', 'Введите целые TP, FP и FN по независимой экспертной разметке.');
    }

    const falsePair = parsePair($('quality-false').value);
    if (falsePair) {
      set('out-false', fmtPct(falsePair.rate * 100));
      set('out-false-note', `${fmt(falsePair.numerator)} ошибочно полных из ${fmt(falsePair.denominator)} эталонно неполных кейсов.`);
    } else {
      set('out-false', 'Нет данных');
      set('out-false-note', 'Введите «ложно полные / все неполные», например 0 / 300.');
    }
  }

  function getFinanceInputs() {
    return {
      cases: parse('fin-cases'),
      eligible: parse('fin-eligible') === null ? null : parse('fin-eligible') / 100,
      adoption: parse('fin-adoption') === null ? null : parse('fin-adoption') / 100,
      minutesSaved: parse('fin-minutes'),
      hourCost: parse('fin-hour-cost'),
      realization: parse('fin-realization') === null ? null : parse('fin-realization') / 100,
      development: parse('fin-development'),
      integration: parse('fin-integration'),
      annualOpex: parse('fin-opex'),
      variableCost: parse('fin-variable') ?? 0,
      variableCostUnknown: $('fin-variable').value.trim() === '',
      rampMonths: parse('fin-ramp')
    };
  }

  function validateFinanceInputs(input) {
    const errors = [];
    const required = [
      ['fin-cases', 'Объём кейсов'], ['fin-eligible', 'Доля применимости'],
      ['fin-adoption', 'Фактическое использование'], ['fin-minutes', 'Экономия времени'],
      ['fin-hour-cost', 'Стоимость часа'], ['fin-realization', 'Реализация эффекта'],
      ['fin-development', 'Разработка'], ['fin-integration', 'Интеграция'],
      ['fin-opex', 'Эксплуатация'], ['fin-ramp', 'Период разгона']
    ];
    required.forEach(([id, label]) => {
      if (parse(id) === null) errors.push(`Заполните поле «${label}».`);
    });
    const rules = [
      ['cases', 'Объём кейсов', 0, 100000000],
      ['eligible', 'Доля применимости', 0, 1],
      ['adoption', 'Фактическое использование', 0, 1],
      ['minutesSaved', 'Экономия времени', 0, 1440],
      ['hourCost', 'Стоимость часа', 0, 10000000],
      ['realization', 'Реализация эффекта', 0, 1],
      ['development', 'Разработка', 0, 100000000000],
      ['integration', 'Интеграция', 0, 100000000000],
      ['annualOpex', 'Эксплуатация', 0, 100000000000],
      ['variableCost', 'OCR/IDP на кейс', 0, 100000000],
      ['rampMonths', 'Период разгона', 0, 12]
    ];
    rules.forEach(([key, label, min, max]) => {
      const value = input[key];
      if (value === null || !Number.isFinite(value)) return;
      if (value < min || value > max) errors.push(`Поле «${label}»: допустимый диапазон ${fmt(min)}–${fmt(max)}.`);
    });
    if (!Number.isInteger(input.cases)) errors.push('Объём кейсов задаётся целым числом.');
    if (!Number.isInteger(input.rampMonths)) errors.push('Период разгона задаётся целым числом месяцев.');
    return [...new Set(errors)];
  }

  function financeCalc(cases, minutesSaved, input) {
    const processed = cases * input.eligible * input.adoption;
    const hours = processed * minutesSaved / 60;
    const capacityValue = hours * input.hourCost;
    const realizedValue = capacityValue * input.realization;
    const variableCosts = processed * input.variableCost;
    const netAnnual = realizedValue - variableCosts - input.annualOpex;
    const rampFactor = input.rampMonths > 0 ? 1 - input.rampMonths / 24 : 1;
    const firstYearNet = (realizedValue - variableCosts) * rampFactor - input.annualOpex;
    const capex = input.development + input.integration;
    const unitContributionPerSourceCase = input.eligible * input.adoption * (minutesSaved / 60 * input.hourCost * input.realization - input.variableCost);
    const opexBreakEven = unitContributionPerSourceCase > 0 ? Math.ceil(input.annualOpex / unitContributionPerSourceCase) : null;
    const firstYearBreakEven = unitContributionPerSourceCase > 0 ? Math.ceil((capex + input.annualOpex) / (unitContributionPerSourceCase * rampFactor)) : null;

    let cumulative = -capex;
    let paybackMonths = null;
    for (let month = 1; month <= 240; month += 1) {
      const utilization = input.rampMonths > 0 && month <= input.rampMonths
        ? Math.max(0, Math.min(1, (month - 0.5) / input.rampMonths))
        : 1;
      cumulative += ((realizedValue - variableCosts) * utilization - input.annualOpex) / 12;
      if (cumulative >= 0) {
        paybackMonths = month;
        break;
      }
    }
    return { processed, hours, capacityValue, realizedValue, variableCosts, netAnnual, rampFactor, firstYearNet, capex, paybackMonths, opexBreakEven, firstYearBreakEven };
  }

  function renderScenarioBars(input) {
    const results = data.financial.scenario_volumes.map((volume) => ({
      volume,
      net: financeCalc(volume, input.minutesSaved, input).netAnnual
    }));
    const maxValue = Math.max(1, ...results.map((row) => Math.abs(row.net)));
    $('scenario-bars').innerHTML = results.map((row) => {
      const width = Math.max(1.2, Math.abs(row.net) / maxValue * 100);
      return `<div class="scenario-row"><span>${fmt(row.volume)}</span><div class="scenario-track"><i class="scenario-fill ${row.net < 0 ? 'negative' : ''}" style="width:${width}%"></i></div><strong>${fmtCompactRub(row.net)}</strong></div>`;
    }).join('');
  }

  function renderSensitivity(input) {
    const volumes = data.financial.scenario_volumes;
    const times = data.financial.sensitivity_minutes;
    $('sensitivity-head').innerHTML = `<tr><th>Кейсов / минут</th>${times.map((m) => `<th>${m} мин</th>`).join('')}</tr>`;
    $('sensitivity-body').innerHTML = volumes.map((volume) => {
      const cells = times.map((minutes) => {
        const net = financeCalc(volume, minutes, input).netAnnual;
        return `<td class="${net >= 0 ? 'positive' : 'negative'}">${fmtCompactRub(net)}</td>`;
      }).join('');
      return `<tr><td>${fmt(volume)} кейсов</td>${cells}</tr>`;
    }).join('');
  }

  function updateFinance() {
    const input = getFinanceInputs();
    const errors = validateFinanceInputs(input);
    const validation = $('finance-validation');
    validation.hidden = errors.length === 0;
    validation.textContent = errors.join(' ');
    if (errors.length) {
      ['fin-processed', 'fin-hours', 'fin-benefit', 'fin-net', 'fin-first-year', 'fin-payback', 'fin-opex-break', 'fin-first-break'].forEach((id) => set(id, '—'));
      $('scenario-bars').replaceChildren();
      $('sensitivity-head').replaceChildren();
      $('sensitivity-body').replaceChildren();
      set('finance-state', 'Проверьте ввод');
      $('fin-net').parentElement.classList.remove('negative', 'positive');
      return;
    }
    const result = financeCalc(input.cases, input.minutesSaved, input);
    set('fin-processed', fmt(result.processed));
    set('fin-hours', fmt(result.hours));
    set('fin-benefit', fmtCompactRub(result.realizedValue));
    set('fin-net', fmtCompactRub(result.netAnnual));
    set('fin-net-note', input.variableCostUnknown ? 'Переменные затраты OCR/IDP не включены: тариф не подтверждён.' : `Включены переменные затраты ${fmtRub(input.variableCost)} на кейс.`);
    set('fin-first-year', fmtCompactRub(result.firstYearNet));
    set('fin-payback', result.paybackMonths === null ? 'Не достигается' : `${fmt(result.paybackMonths)} мес.`);
    set('fin-opex-break', result.opexBreakEven === null ? 'Нет порога' : fmt(result.opexBreakEven));
    set('fin-first-break', result.firstYearBreakEven === null ? 'Нет порога' : fmt(result.firstYearBreakEven));
    $('fin-net').parentElement.classList.toggle('negative', result.netAnnual < 0);
    $('fin-net').parentElement.classList.toggle('positive', result.netAnnual >= 0);
    $('finance-state').textContent = input.variableCostUnknown ? 'Без переменных затрат' : 'Переменные затраты учтены';
    $('ramp-explanation').textContent = input.rampMonths > 0
      ? `Разгон ${fmt(input.rampMonths)} мес.: модель предполагает линейный рост загрузки от 0 до 100%. Коэффициент среднего использования в первом году — ${fmtPct(result.rampFactor * 100)}. Денежный поток считается помесячно; CAPEX списывается в момент старта.`
      : 'Разгон не задан: предполагается 100% плановой загрузки с первого месяца. Окупаемость рассчитана помесячно после первоначального CAPEX. Модель не включает дисконтирование и налоги.';
    renderScenarioBars(input);
    renderSensitivity(input);
  }

  function initializeFinance() {
    const input = data.financial.default_inputs;
    const mapping = {
      'fin-cases': input.cases,
      'fin-eligible': input.eligible * 100,
      'fin-adoption': input.adoption * 100,
      'fin-minutes': input.minutes_saved,
      'fin-hour-cost': input.hour_cost,
      'fin-realization': input.realization * 100,
      'fin-development': input.development,
      'fin-integration': input.integration,
      'fin-opex': input.annual_opex,
      'fin-ramp': input.ramp_months
    };
    Object.entries(mapping).forEach(([id, value]) => { $(id).value = value; });
    $('fin-variable').value = '';
    $('finance-form').addEventListener('input', updateFinance);
    $('finance-form').addEventListener('reset', (event) => {
      event.preventDefault();
      initializeFinanceValues();
    });
    updateFinance();
  }

  function initializeFinanceValues() {
    const input = data.financial.default_inputs;
    const mapping = {
      'fin-cases': input.cases, 'fin-eligible': input.eligible * 100,
      'fin-adoption': input.adoption * 100, 'fin-minutes': input.minutes_saved,
      'fin-hour-cost': input.hour_cost, 'fin-realization': input.realization * 100,
      'fin-development': input.development, 'fin-integration': input.integration,
      'fin-opex': input.annual_opex, 'fin-ramp': input.ramp_months
    };
    Object.entries(mapping).forEach(([id, value]) => { $(id).value = value; });
    $('fin-variable').value = '';
    updateFinance();
  }

  function init() {
    Promise.all([
      fetch('analytics-data.json').then((response) => { if (!response.ok) throw new Error('analytics-data.json'); return response.json(); }),
      fetch('benchmark-summary.json').then((response) => { if (!response.ok) throw new Error('benchmark-summary.json'); return response.json(); })
    ]).then(([model, report]) => {
      data = model;
      benchmark = report;
      renderStatus();
      renderCompetitors();
      renderMetricTargets();
      renderSources();
      initializeFinance();
      ['qual-process', 'qual-gap', 'qual-integration', 'qual-owner'].forEach((id) => $(id).addEventListener('input', updateQualification));
      ['time-control', 'time-trace', 'repeat-control', 'repeat-trace', 'quality-tp', 'quality-fp', 'quality-fn', 'quality-false'].forEach((id) => $(id).addEventListener('input', updatePilotMetrics));
      updateQualification();
      updatePilotMetrics();
    }).catch((error) => {
      console.error('Не удалось загрузить аналитику Trace:', error);
      const root = document.querySelector('.analytics-main');
      const message = document.createElement('p');
      message.className = 'caution-note';
      message.textContent = 'Не удалось загрузить данные аналитики. Проверьте, что сайт открыт через локальный сервер или опубликован вместе с analytics-data.json и benchmark-summary.json.';
      root.prepend(message);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
