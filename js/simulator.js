const TEAM_NAME = "Pittsburgh Port Authority";
const REGION = "Mid-Atlantic";

let RANKINGS = null;
let HISTORY = null;
let META = null;

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function parseRecord(record) {
  const parts = record.split("-").map(s => parseInt(s.trim(), 10));
  if (parts.length !== 2 || parts.some(isNaN)) return { wins: 0, losses: 0, games: 0 };
  return { wins: parts[0], losses: parts[1], games: parts[0] + parts[1] };
}

/**
 * USAU Algorithm's documented per-game rating:
 * game_PR = opponent_rating +/- 400 / max(2/3, 2.5 * (losing_score/winning_score)^2)
 * (+ for the winner, - for the loser)
 */
function gamePR(oppRating, ourScore, oppScore) {
  const won = ourScore > oppScore;
  const ws = won ? ourScore : oppScore;
  const ls = won ? oppScore : ourScore;
  const x = Math.max(2 / 3, 2.5 * Math.pow(ls / ws, 2));
  const delta = 400 / x;
  return won ? oppRating + delta : oppRating - delta;
}

function isLikelyBlowoutExcluded(ourRating, oppRating, ourScore, oppScore) {
  const won = ourScore > oppScore;
  if (!won) return false;
  const ws = ourScore, ls = oppScore;
  return (ourRating - oppRating) > 600 && ws > (2 * ls + 1);
}

function projectRating(currentRating, gamesPlayed, newGamePRs) {
  const totalWeight = gamesPlayed + newGamePRs.length;
  if (totalWeight === 0) return currentRating;
  const sum = currentRating * gamesPlayed + newGamePRs.reduce((a, b) => a + b, 0);
  return sum / totalWeight;
}

function teamOptionsHTML() {
  return RANKINGS.rankings
    .map(r => `<option value="${r.team}" data-rating="${r.rating}">`)
    .join("");
}

function makeGameRow(container, defaultTournament) {
  const row = document.createElement("div");
  row.className = "game-row";
  row.innerHTML = `
    <input type="text" class="opp-name" list="team-options" placeholder="Opponent name">
    <input type="number" class="opp-rating" placeholder="Opp. rating">
    <input type="number" class="our-score" placeholder="Us" min="0">
    <span style="text-align:center;">&ndash;</span>
    <input type="number" class="opp-score" placeholder="Opp" min="0">
    <button class="remove" title="Remove game">&times;</button>
  `;

  const tSelect = document.createElement("select");
  tSelect.className = "tournament";
  tSelect.innerHTML = `
    <option value="SFI-East">SFI-East</option>
    <option value="ESC">ESC</option>
    <option value="Other">Other</option>
  `;
  if (defaultTournament) tSelect.value = defaultTournament;
  row.insertBefore(tSelect, row.firstChild);

  row.querySelector(".opp-name").addEventListener("input", (e) => {
    const match = RANKINGS.rankings.find(r => r.team.toLowerCase() === e.target.value.toLowerCase());
    if (match) {
      row.querySelector(".opp-rating").value = match.rating;
    }
  });

  row.querySelector(".remove").addEventListener("click", () => row.remove());

  container.appendChild(row);
  return row;
}

function readGameRows(container) {
  const games = [];
  container.querySelectorAll(".game-row").forEach(row => {
    const oppName = row.querySelector(".opp-name").value.trim();
    const oppRating = parseFloat(row.querySelector(".opp-rating").value);
    const ourScore = parseInt(row.querySelector(".our-score").value, 10);
    const oppScore = parseInt(row.querySelector(".opp-score").value, 10);
    const tournament = row.querySelector(".tournament").value;
    if (!oppName || isNaN(oppRating) || isNaN(ourScore) || isNaN(oppScore)) return;
    games.push({ oppName, oppRating, ourScore, oppScore, tournament });
  });
  return games;
}

function renderFreshness() {
  document.getElementById("freshness").textContent =
    `Baseline data: ${RANKINGS.source_last_modified || "unknown"} (pulled ${formatDate(RANKINGS.scraped_at)})`;
}

function setupRivalPanels() {
  const rivalContainer = document.getElementById("rival-games");
  const rivals = RANKINGS.rankings.filter(r => r.region === REGION && r.team !== TEAM_NAME);
  rivals.forEach(rival => {
    const block = document.createElement("div");
    block.style.marginBottom = "1rem";
    block.innerHTML = `<h3 style="font-size:0.95rem; margin-bottom:0.4rem;">${rival.team} <span style="color:var(--muted); font-weight:400;">(current rating ${rival.rating})</span></h3>`;
    const rowsDiv = document.createElement("div");
    rowsDiv.className = "rival-rows";
    rowsDiv.dataset.team = rival.team;
    block.appendChild(rowsDiv);
    const addBtn = document.createElement("button");
    addBtn.className = "secondary";
    addBtn.textContent = "+ Add Game";
    addBtn.addEventListener("click", () => makeGameRow(rowsDiv));
    block.appendChild(addBtn);
    rivalContainer.appendChild(block);
  });
}

function calculate() {
  const paGames = readGameRows(document.getElementById("pa-games"));
  const betaOn = document.getElementById("beta-toggle").checked;

  const projectedRatings = {}; // team -> {rating, gamesAdded}
  const warnings = [];

  const paRow = RANKINGS.rankings.find(r => r.team === TEAM_NAME);
  const paRecord = parseRecord(paRow.record);
  const paGamePRs = paGames.map(g => {
    if (isLikelyBlowoutExcluded(paRow.rating, g.oppRating, g.ourScore, g.oppScore)) {
      warnings.push(`Your ${g.oppName} result may be excluded by USAU's blowout rule (still counted here).`);
    }
    return gamePR(g.oppRating, g.ourScore, g.oppScore);
  });
  projectedRatings[TEAM_NAME] = {
    rating: projectRating(paRow.rating, paRecord.games, paGamePRs),
    gamesAdded: paGames.length,
  };

  if (betaOn) {
    document.querySelectorAll("#rival-games .rival-rows").forEach(rowsDiv => {
      const teamName = rowsDiv.dataset.team;
      const teamRow = RANKINGS.rankings.find(r => r.team === teamName);
      const record = parseRecord(teamRow.record);
      const games = readGameRows(rowsDiv);
      const gamePRs = games.map(g => gamePR(g.oppRating, g.ourScore, g.oppScore));
      projectedRatings[teamName] = {
        rating: projectRating(teamRow.rating, record.games, gamePRs),
        gamesAdded: games.length,
      };
    });
  }

  renderResults(projectedRatings, warnings);
}

function renderResults(projectedRatings, warnings) {
  document.getElementById("results-panel").style.display = "block";

  const paRow = RANKINGS.rankings.find(r => r.team === TEAM_NAME);
  const newPaRating = projectedRatings[TEAM_NAME].rating;
  const delta = newPaRating - paRow.rating;

  document.getElementById("res-rating").textContent = newPaRating.toFixed(1);
  const deltaEl = document.getElementById("res-rating-delta");
  deltaEl.textContent = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} from current ${paRow.rating}`;
  deltaEl.className = `sub delta ${delta >= 0 ? "up" : "down"}`;

  const bids = RANKINGS.bid_allocation[REGION] ?? 0;
  const regionTeams = RANKINGS.rankings
    .filter(r => r.region === REGION)
    .map(r => ({
      team: r.team,
      rating: projectedRatings[r.team] ? projectedRatings[r.team].rating : r.rating,
      gamesAdded: projectedRatings[r.team] ? projectedRatings[r.team].gamesAdded : 0,
    }))
    .sort((a, b) => b.rating - a.rating);

  const myIndex = regionTeams.findIndex(t => t.team === TEAM_NAME);
  const inLine = myIndex < bids;
  document.getElementById("res-position").textContent = `#${myIndex + 1} of ${regionTeams.length}`;
  document.getElementById("res-position-sub").innerHTML = inLine
    ? `<span class="badge good">projected inside bid line</span>`
    : `<span class="badge bad">projected outside by ${myIndex + 1 - bids}</span>`;

  const tbody = document.querySelector("#projected-table tbody");
  tbody.innerHTML = "";
  regionTeams.forEach((t, idx) => {
    const tr = document.createElement("tr");
    const isInLine = idx < bids;
    tr.className = isInLine ? "on-bid-line" : "off-bid-line";
    if (t.team === TEAM_NAME) tr.classList.add("highlight-team");
    tr.innerHTML = `
      <td>${t.team}</td>
      <td>${t.rating.toFixed(1)}</td>
      <td>${t.gamesAdded || "–"}</td>
      <td>${isInLine ? '<span class="badge good">in bid line</span>' : '<span class="badge bad">outside</span>'}</td>
    `;
    tbody.appendChild(tr);
  });

  const years = [...HISTORY.years].sort((a, b) => b.year - a.year);
  const mostRecent = years[0];
  let baselineText = `<strong>Historical baseline:</strong> Mid-Atlantic held ${mostRecent.bids} bid(s) as recently as ${mostRecent.year} (${mostRecent.notes})`;
  if (warnings.length) {
    baselineText += `<br><br>` + warnings.map(w => `⚠️ ${w}`).join("<br>");
  }
  baselineText += `<br><br><em>Reminder: this is a simplified projection of your own rating movement. The region's actual bid count also depends on how every other region's top teams perform, and your Nationals berth is ultimately decided at the Regional Championship tournament, not by rating alone.</em>`;
  document.getElementById("baseline-note").innerHTML = baselineText;
}

function resetSimulator() {
  document.getElementById("pa-games").innerHTML = "";
  document.getElementById("rival-games").innerHTML = "";
  document.getElementById("beta-toggle").checked = false;
  document.getElementById("beta-panel").style.display = "none";
  document.getElementById("results-panel").style.display = "none";
  makeGameRow(document.getElementById("pa-games"), "SFI-East");
  setupRivalPanels();
}

async function init() {
  try {
    [RANKINGS, HISTORY, META] = await Promise.all([
      loadJSON("data/rankings.json"),
      loadJSON("data/bid_history.json"),
      loadJSON("data/meta.json"),
    ]);
  } catch (err) {
    document.getElementById("freshness").textContent = "Could not load data — see console.";
    console.error(err);
    return;
  }

  document.getElementById("team-options").innerHTML = teamOptionsHTML();
  renderFreshness();

  document.getElementById("add-pa-game").addEventListener("click", () =>
    makeGameRow(document.getElementById("pa-games"), "SFI-East")
  );
  document.getElementById("beta-toggle").addEventListener("change", (e) => {
    document.getElementById("beta-panel").style.display = e.target.checked ? "block" : "none";
  });
  document.getElementById("calculate").addEventListener("click", calculate);
  document.getElementById("reset").addEventListener("click", resetSimulator);

  setupRivalPanels();
  makeGameRow(document.getElementById("pa-games"), "SFI-East");
}

init();
