"use strict";
(() => {
  const data = window.APPLE_DATA;
  const $ = id => document.getElementById(id);
  const number = value => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const growth = (value, previous) => (value / previous - 1) * 100;
  const signed = (value, decimals = 1) => `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
  const dateLabel = value => value.replaceAll("-", ".");
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = (tag, attrs = {}, content) => {
    const element = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    if (content !== undefined) element.textContent = content;
    return element;
  };

  function showFinancials(period) {
    const values = data.financials[period];
    $("financial-period").textContent = values.period;
    ["revenue", "operatingIncome", "netIncome", "eps"].forEach(key => {
      $(`metric-${key}`).textContent = number(values[key] / (key === "eps" ? 1 : 1000));
      const previousKey = `previous${key[0].toUpperCase()}${key.slice(1)}`;
      $(`growth-${key}`).textContent = signed(growth(values[key], values[previousKey]));
    });
    document.querySelectorAll("[data-financial]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.financial === period)));
    const rows = values.categories.map(category => {
      const row = document.createElement("div");
      row.className = "category-row";
      const line = document.createElement("div");
      line.className = "category-line";
      const name = document.createElement("span");
      name.textContent = category.name;
      const value = document.createElement("strong");
      value.textContent = number(category.value / 1000);
      const delta = document.createElement("em");
      delta.textContent = `(${signed(growth(category.value, category.previous))})`;
      value.append(delta);
      line.append(name, value);
      const bar = document.createElement("div");
      bar.className = "category-bar";
      bar.style.width = `${category.value / values.revenue * 100}%`;
      bar.setAttribute("aria-hidden", "true");
      row.append(line, bar);
      return row;
    });
    $("category-list").replaceChildren(...rows);
  }

  let selectedPrices = [];
  let points = [];
  let focusLine;
  let focusDot;
  let chartBounds;
  let chartSize = { width: 960, height: 300 };
  let selectedRange = 22;

  function selectPrice(index, showTooltip = false) {
    const point = points[index];
    const value = selectedPrices[index];
    $("price-cursor").value = index;
    $("price-cursor").setAttribute("aria-valuetext", `${dateLabel(value.date)}, ${number(value.close)} 달러`);
    $("selected-price").textContent = `${dateLabel(value.date)} / $${number(value.close)}`;
    focusLine.setAttribute("x1", point.x);
    focusLine.setAttribute("x2", point.x);
    focusDot.setAttribute("cx", point.x);
    focusDot.setAttribute("cy", point.y);
    const tooltip = $("chart-tooltip");
    tooltip.hidden = !showTooltip;
    if (showTooltip) {
      tooltip.textContent = `${dateLabel(value.date)} / $${number(value.close)}`;
      const box = $("price-chart").getBoundingClientRect();
      const scale = Math.min(box.width / chartSize.width, box.height / chartSize.height);
      const offsetX = (box.width - chartSize.width * scale) / 2;
      const offsetY = (box.height - chartSize.height * scale) / 2;
      const left = Math.max(0, Math.min(box.width - tooltip.offsetWidth, offsetX + point.x * scale - tooltip.offsetWidth / 2));
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${Math.max(0, offsetY + point.y * scale - 43)}px`;
    }
  }

  function showPrices(count) {
    selectedRange = count;
    selectedPrices = data.prices.slice(-count);
    const first = selectedPrices[0];
    const last = selectedPrices[selectedPrices.length - 1];
    const change = growth(last.close, first.close);
    $("price-return").textContent = signed(change, 2);
    $("price-period").textContent = `${dateLabel(first.date)} ~ ${dateLabel(last.date)}`;
    $("chart-desc").textContent = `${dateLabel(first.date)} ${number(first.close)}달러에서 ${dateLabel(last.date)} ${number(last.close)}달러로 ${signed(change, 2)} 변했습니다. ${selectedPrices.length}거래일의 종가를 표시합니다. 가로축은 거래일 순서입니다.`;
    document.querySelectorAll("[data-range]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.range) === count)));
    $("price-cursor").max = selectedPrices.length - 1;
    const chart = $("price-chart");
    chartSize = { width: Math.max(280, Math.round(chart.getBoundingClientRect().width)), height: window.innerWidth < 768 ? 250 : 300 };
    chart.setAttribute("viewBox", `0 0 ${chartSize.width} ${chartSize.height}`);
    chart.style.aspectRatio = `${chartSize.width} / ${chartSize.height}`;
    chart.querySelectorAll(":scope > g").forEach(group => group.remove());
    const plot = svg("g");
    const left = 8, right = chartSize.width - 48, top = 22, bottom = chartSize.height - 43;
    const min = Math.floor((Math.min(...selectedPrices.map(p => p.close)) - 3) / 5) * 5;
    const max = Math.ceil((Math.max(...selectedPrices.map(p => p.close)) + 3) / 5) * 5;
    chartBounds = { left, right };
    const y = value => bottom - (value - min) / (max - min) * (bottom - top);
    for (let i = 0; i <= 4; i++) {
      const value = min + (max - min) * i / 4;
      plot.append(svg("line", { x1: left, x2: right, y1: y(value), y2: y(value), stroke: "#e3e8ef", "stroke-width": 1 }));
      plot.append(svg("text", { x: right + 15, y: y(value) + 4 }, value.toFixed(value % 1 ? 1 : 0)));
    }
    points = selectedPrices.map((value, i) => ({ x: left + i / (selectedPrices.length - 1) * (right - left), y: y(value.close) }));
    plot.append(svg("polyline", { points: points.map(point => `${point.x},${point.y}`).join(" "), fill: "none", stroke: "#315dba", "stroke-width": 2.7, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    const labelIndices = [...new Set([0, Math.floor((points.length - 1) / 3), Math.floor((points.length - 1) * 2 / 3), points.length - 1])];
    labelIndices.forEach(index => plot.append(svg("text", { x: points[index].x, y: chartSize.height - 12, "text-anchor": index === 0 ? "start" : index === points.length - 1 ? "end" : "middle" }, dateLabel(selectedPrices[index].date).slice(5))));
    focusLine = svg("line", { y1: top, y2: bottom, stroke: "#8996ac", "stroke-width": 1, "stroke-dasharray": "4 5" });
    focusDot = svg("circle", { r: 5, fill: "#315dba", stroke: "#fbfcfe", "stroke-width": 2.5 });
    plot.append(focusLine, focusDot);
    chart.append(plot);
    $("price-table-caption").textContent = `${dateLabel(first.date)} ~ ${dateLabel(last.date)} AAPL 정규장 종가`;
    const rows = selectedPrices.map(value => {
      const row = document.createElement("tr");
      const dateCell = document.createElement("th");
      dateCell.scope = "row";
      dateCell.textContent = dateLabel(value.date);
      const closeCell = document.createElement("td");
      closeCell.textContent = number(value.close);
      row.append(dateCell, closeCell);
      return row;
    });
    $("price-table-body").replaceChildren(...rows);
    selectPrice(selectedPrices.length - 1);
  }

  document.querySelectorAll("[data-financial]").forEach(button => button.addEventListener("click", () => showFinancials(button.dataset.financial)));
  document.querySelectorAll("[data-range]").forEach(button => button.addEventListener("click", () => showPrices(Number(button.dataset.range))));
  $("price-cursor").addEventListener("input", event => selectPrice(Number(event.target.value)));
  $("price-chart").addEventListener("pointermove", event => {
    const box = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(box.width / chartSize.width, box.height / chartSize.height);
    const offset = (box.width - chartSize.width * scale) / 2;
    const x = (event.clientX - box.left - offset) / scale;
    const index = Math.round((x - chartBounds.left) / (chartBounds.right - chartBounds.left) * (selectedPrices.length - 1));
    selectPrice(Math.max(0, Math.min(points.length - 1, index)), true);
  });
  $("price-chart").addEventListener("pointerleave", () => { $("chart-tooltip").hidden = true; });
  showFinancials("quarter");
  showPrices(22);

  if ("ResizeObserver" in window) {
    const chartResize = new ResizeObserver(() => {
      const width = Math.max(280, Math.round($("price-chart").getBoundingClientRect().width));
      if (width !== chartSize.width) showPrices(selectedRange);
    });
    chartResize.observe($("price-chart"));
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (!visible.length) return;
      document.querySelectorAll("nav a").forEach(link => {
        if (link.hash === `#${visible[0].target.id}`) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    }, { rootMargin: "-100px 0px -45% 0px", threshold: [0, 0.1, 0.5] });
    document.querySelectorAll("main > section").forEach(section => observer.observe(section));
  }
})();
