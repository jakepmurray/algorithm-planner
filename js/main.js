const TEAM_NAME = "Pittsburgh Port Authority";
const REGION = "Mid-Atlantic";

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

function formatDate(iso) {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function renderFreshness(rankings) {
  const el = document.getElementById("freshness");
  const scraped = formatDate(rankings.scraped_at);
  const sourceMod = rankings.source_last_modified || "unknown";
  el.textContent = `Source last modified: ${sourceMod} · Data pulled: ${scraped}`;
}

function renderSummaryCards(rankings) {
  const bids = rankings.bid_allocation[REGION] ?? 0;
  document.getElementById("card-bids").textContent = bids;

  const regionTeams = rankings.rankings
    .filter(r => r.region === REGION)
    .sort((a, b) => b.rating - a.rating);

  const me = rankings.rankings.find(r => r.team === TEAM_NAME);
  const myRegionIndex = regionTeams.findIndex(r => r.team === TEAM_NAME);

  if (me) {
    document.getElementById("card-rank").textContent = `#${me.rank}`;
    document.getElementById("card-rating").textContent = me.rating;
    document.getElementById("card-record").textContent = `record ${me.record}`;
  } else {
    document.getElementById("card-rank").textContent = "unranked";
    document.getElementById("card-rating").textContent = "–";
  }

  if (myRegionIndex >= 0) {
    const positionLabel = `#${myRegionIndex + 1} of ${regionTeams.length}`;
    document.getElementById("card-position").textContent = positionLabel;
    const inLine = myRegionIndex < bids;
    document.getElementById("card-position-sub").innerHTML = inLine
      ? `<span class="badge good">inside bid line</span>`
      : `<span class="badge bad">outside bid line by ${myRegionIndex + 1 - bids}</span>`;
  }
}

function renderRegionTable(rankings) {
  const bids = rankings.bid_allocation[REGION] ?? 0;
  const regionTeams = rankings.rankings
    .filter(r => r.region === REGION)
    .sort((a, b) => b.rating - a.rating);

  const tbody = document.querySelector("#region-table tbody");
  tbody.innerHTML = "";

  regionTeams.forEach((team, idx) => {
    const tr = document.createElement("tr");
    const inLine = idx < bids;
    tr.className = inLine ? "on-bid-line" : "off-bid-line";
    if (team.team === TEAM_NAME) tr.classList.add("highlight-team");

    const statusBadge = inLine
      ? `<span class="badge good">in bid line</span>`
      : `<span class="badge bad">outside (+${idx + 1 - bids})</span>`;

    tr.innerHTML = `
      <td>#${team.rank}</td>
      <td>${team.team}</td>
      <td>${team.record}</td>
      <td>${team.rating}</td>
      <td>${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderBidTable(rankings) {
  const tbody = document.querySelector("#bid-table tbody");
  tbody.innerHTML = "";
  const entries = Object.entries(rankings.bid_allocation).sort((a, b) => b[1] - a[1]);
  for (const [region, bids] of entries) {
    const tr = document.createElement("tr");
    if (region === REGION) tr.classList.add("highlight-team");
    tr.innerHTML = `<td>${region}</td><td>${bids}</td>`;
    tbody.appendChild(tr);
  }
}

function renderHistoryTable(history) {
  const tbody = document.querySelector("#history-table tbody");
  tbody.innerHTML = "";
  const years = [...history.years].sort((a, b) => b.year - a.year);
  for (const y of years) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${y.year}</td>
      <td>${y.bids}</td>
      <td>${y.qualified_teams.join(", ")}</td>
      <td>${y.notes}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderNextTournaments(meta) {
  const el = document.getElementById("next-tournaments");
  const items = meta.remaining_tournaments
    .map(t => `<strong>${t.abbreviation}</strong> (${t.name}) &mdash; ${t.dates} in ${t.location}`)
    .join("<br>");
  el.innerHTML = `${items}<br><br>Final Regular Season Rankings (used for bid allocation): <strong>${meta.season_dates.final_regular_season_rankings}</strong>.
    Head to the <a href="simulator.html">Score Simulator</a> to see how results at these events could move Port Authority's standing.`;
}

async function init() {
  try {
    const [rankings, history, meta] = await Promise.all([
      loadJSON("data/rankings.json"),
      loadJSON("data/bid_history.json"),
      loadJSON("data/meta.json"),
    ]);
    renderFreshness(rankings);
    renderSummaryCards(rankings);
    renderRegionTable(rankings);
    renderBidTable(rankings);
    renderHistoryTable(history);
    renderNextTournaments(meta);
  } catch (err) {
    document.getElementById("freshness").textContent = "Could not load data — see console.";
    console.error(err);
  }
}

init();
