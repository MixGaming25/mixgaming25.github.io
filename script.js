"use strict";

/*
  Static profile configuration.

  Replace the empty values below with your real IDs or keys. GitHub Pages is public
  static hosting, so anything placed here can be viewed by visitors.
*/
const CONFIG = {
  discordUserId: "254235647714263041",
  steam: {
    apiKey: "87DEExxxxxxxxxxxxxxx4",
    steamId64: "765xxxxxxxxxxxxxxx466",
    // Steam often blocks browser requests with CORS. A public CORS proxy keeps this
    // GitHub Pages compatible, but you can set this to "" if direct fetch works.
    corsProxy: "https://corsproxy.io/?",
  },
  lastfm: {
    apiKey: "3dbc7971f13452fea66caed91486b1c8",
    username: "mix2555",
  },
};

const REFRESH = {
  discord: 30_000,
  music: 60_000,
};

const STATUS_LABELS = {
  online: "Online",
  idle: "Idle",
  dnd: "DND",
  offline: "Offline",
};

const STEAM_PERSONA_STATES = [
  "Offline",
  "Online",
  "Busy",
  "Away",
  "Snooze",
  "Looking to trade",
  "Looking to play",
];

const $ = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", () => {
  initParticles();
  initReveal();
  initAskForm();
  initDiscordCopy();
  loadDiscordPresence();
  loadSteamStatus();
  loadMusicStatus();

  window.setInterval(loadDiscordPresence, REFRESH.discord);
  window.setInterval(loadMusicStatus, REFRESH.music);
});

function initReveal() {
  const revealItems = document.querySelectorAll(".reveal");

  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 },
  );

  revealItems.forEach((item) => observer.observe(item));
}

function initAskForm() {
  const form = $("#ask-form");
  const submit = $("#ask-submit");
  const message = $("#form-message");

  if (!form || !submit || !message) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (form.action.includes("YOUR_FORMSPREE_ID")) {
      setFormMessage(
        "Add your Formspree endpoint to the form action before sending.",
        "error",
      );
      return;
    }

    submit.disabled = true;
    submit.textContent = "Sending";
    setFormMessage("", "");

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });

      if (!response.ok) throw new Error("Formspree rejected the message.");

      form.reset();
      setFormMessage("Sent. Thanks for asking.", "success");
    } catch (error) {
      setFormMessage("Could not send right now. Try again later.", "error");
    } finally {
      submit.disabled = false;
      submit.textContent = "Send";
    }
  });

  function setFormMessage(text, type) {
    message.textContent = text;
    message.className = `form-message ${type}`.trim();
  }
}

// Copy Discord username to clipboard on click
function initDiscordCopy() {
  const discordLink = document.getElementById("discord-link");
  if (!discordLink) return;

  discordLink.addEventListener("click", () => {
    const username = "mihailooo.p";
    
    navigator.clipboard.writeText(username)
      .then(() => {
        const smallTag = discordLink.querySelector("small");
        if (!smallTag) return;
        
        const originalText = smallTag.textContent;
        smallTag.textContent = "Copied!";
        
        setTimeout(() => {
          smallTag.textContent = originalText;
        }, 2000);
      })
      .catch(err => {
        console.error("Could not copy text: ", err);
      });
  });
}

async function loadDiscordPresence() {
  const card = $("#discord-card");
  const updated = $("#discord-updated");
  if (!card || !updated) return;

  if (!CONFIG.discordUserId) {
    card.innerHTML = emptyStatusMarkup(
      "Discord not configured",
      "Add your Discord user ID to CONFIG.discordUserId in script.js.",
      "offline",
    );
    updated.textContent = "waiting for user id";
    return;
  }

  try {
    const response = await fetch(
      `https://api.lanyard.rest/v1/users/${encodeURIComponent(CONFIG.discordUserId)}`,
      { cache: "no-store" },
    );
    const payload = await response.json();
    if (!payload.success) throw new Error("Lanyard returned an error.");

    const data = payload.data;
    const user = data.discord_user;
    const avatar = discordAvatarUrl(user);
    const status = data.discord_status || "offline";
    const activity = getDiscordActivity(data.activities);
    const game = getDiscordGame(data.activities);

    card.innerHTML = `
      <div class="avatar">${avatar ? `<img src="${escapeAttr(avatar)}" alt="${escapeAttr(user.username)} avatar">` : ""}</div>
      <div class="status-content">
        <div class="status-topline">
          <span class="status-name">${escapeHtml(user.global_name || user.username)}</span>
          <span class="status-pill ${escapeAttr(status)}">${STATUS_LABELS[status] || status}</span>
        </div>
        <p class="status-detail">${activity ? escapeHtml(activity) : '<span class="status-empty">No current activity.</span>'}</p>
        <p class="status-detail">${game ? `Playing ${escapeHtml(game)}` : '<span class="status-empty">No game detected.</span>'}</p>
      </div>
    `;
    updated.textContent = `updated ${timeStamp()}`;
  } catch (error) {
    card.innerHTML = emptyStatusMarkup(
      "Discord unavailable",
      "Presence could not be loaded from Lanyard.",
      "offline",
    );
    updated.textContent = "error";
  }
}

async function loadSteamStatus() {
  const card = $("#steam-card");
  const updated = $("#steam-updated");
  if (!card || !updated) return;

  if (!CONFIG.steam.apiKey || !CONFIG.steam.steamId64) {
    card.innerHTML = emptyStatusMarkup(
      "Steam not configured",
      "Add your Steam Web API key and SteamID64 in script.js.",
      "offline",
    );
    updated.textContent = "waiting for api key";
    return;
  }

  try {
    const rawSteamUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${CONFIG.steam.apiKey}&steamids=${CONFIG.steam.steamId64}`;

    const requestUrl = CONFIG.steam.corsProxy
      ? `${CONFIG.steam.corsProxy}${rawSteamUrl}`
      : rawSteamUrl;

    const response = await fetch(requestUrl, { cache: "no-store" });
    const payload = await response.json();
    const player = payload?.response?.players?.[0];

    if (!player) throw new Error("Steam player not found.");

    const state = STEAM_PERSONA_STATES[player.personastate] || "Unknown";
    const isOnline = player.personastate > 0;
    const game = player.gameextrainfo || "";
    const statusClass = game ? "online" : isOnline ? "idle" : "offline";

    card.innerHTML = `
      <div class="avatar"><img src="${escapeAttr(player.avatarfull || player.avatarmedium || "")}" alt="${escapeAttr(player.personaname)} avatar"></div>
      <div class="status-content">
        <div class="status-topline">
          <span class="status-name">${escapeHtml(player.personaname)}</span>
          <span class="status-pill ${statusClass}">${escapeHtml(state)}</span>
        </div>
        <p class="status-detail">${game ? `In-game: ${escapeHtml(game)}` : "Not currently in-game."}</p>
        <p class="status-detail status-empty">${isOnline ? "Steam profile is online." : "Steam profile is offline."}</p>
      </div>
    `;
    updated.textContent = `updated ${timeStamp()}`;
  } catch (error) {
    card.innerHTML = emptyStatusMarkup(
      "Steam - work in progress",
      "Steam status could not be loaded. Check the key, SteamID64, and CORS proxy.",
      "offline (lies)",
    );
    updated.textContent = "error";
  }
}

async function loadMusicStatus() {
  const card = $("#music-card");
  const updated = $("#music-updated");
  if (!card || !updated) return;

  if (!CONFIG.lastfm.apiKey || !CONFIG.lastfm.username) {
    card.innerHTML = emptyMusicMarkup(
      "Last.fm not configured",
      "Add your Last.fm API key and username in script.js.",
    );
    updated.textContent = "waiting for api key";
    return;
  }

  try {
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.searchParams.set("method", "user.getrecenttracks");
    url.searchParams.set("user", CONFIG.lastfm.username);
    url.searchParams.set("api_key", CONFIG.lastfm.apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const response = await fetch(url.toString(), { cache: "no-store" });
    const payload = await response.json();
    const track = payload?.recenttracks?.track?.[0];

    if (!track) throw new Error("No recent Last.fm track.");

    const nowPlaying = track["@attr"]?.nowplaying === "true";
    const image = getLargestLastfmImage(track.image);
    const artist = track.artist?.["#text"] || "Unknown artist";
    const title = track.name || "Unknown track";

    card.innerHTML = `
      <div class="album-art">${image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(title)} album cover">` : ""}</div>
      <div class="status-content">
        <div class="status-topline">
          <span class="status-name">${escapeHtml(title)}</span>
          <span class="status-pill ${nowPlaying ? "online" : "offline"}">${nowPlaying ? "Now playing" : "Recent"}</span>
        </div>
        <p class="status-detail">${escapeHtml(artist)}</p>
        <p class="status-detail status-empty">${nowPlaying ? "Live from Last.fm." : "Most recently played track."}</p>
      </div>
    `;
    updated.textContent = `updated ${timeStamp()}`;
  } catch (error) {
    card.innerHTML = emptyMusicMarkup(
      "Music unavailable",
      "Last.fm data could not be loaded right now.",
    );
    updated.textContent = "error";
  }
}

function initParticles() {
  const canvas = $("#particle-canvas");
  if (!canvas) return;

  const context = canvas.getContext("2d");
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  let width = 0;
  let height = 0;
  let particles = [];
  let animationFrame = null;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const count = Math.max(26, Math.min(72, Math.floor(width / 18)));
    particles = Array.from({ length: count }, () =>
      createParticle(width, height),
    );
  };

  const draw = () => {
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(125, 211, 252, 0.32)";

    particles.forEach((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;

      if (particle.x < -10) particle.x = width + 10;
      if (particle.x > width + 10) particle.x = -10;
      if (particle.y < -10) particle.y = height + 10;
      if (particle.y > height + 10) particle.y = -10;

      context.globalAlpha = particle.alpha;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
    });

    context.globalAlpha = 1;
    drawConnections(context, particles);
    animationFrame = window.requestAnimationFrame(draw);
  };

  window.addEventListener("resize", resize, { passive: true });
  resize();

  if (!reducedMotion) {
    draw();
  } else {
    drawConnections(context, particles);
  }

  window.addEventListener("beforeunload", () => {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
  });
}

function createParticle(width, height) {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.16,
    vy: (Math.random() - 0.5) * 0.16,
    radius: Math.random() * 1.5 + 0.4,
    alpha: Math.random() * 0.35 + 0.08,
  };
}

function drawConnections(context, particles) {
  const maxDistance = 130;
  context.lineWidth = 1;

  for (let i = 0; i < particles.length; i += 1) {
    for (let j = i + 1; j < particles.length; j += 1) {
      const a = particles[i];
      const b = particles[j];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);

      if (distance < maxDistance) {
        context.strokeStyle = `rgba(56, 189, 248, ${0.11 * (1 - distance / maxDistance)})`;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }
  }
}

function discordAvatarUrl(user) {
  if (!user?.id || !user?.avatar) return "";
  const extension = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=160`;
}

function getDiscordActivity(activities = []) {
  const custom = activities.find((activity) => activity.type === 4);
  if (custom?.state) return custom.state;

  const listening = activities.find((activity) => activity.type === 2);
  if (listening?.name) {
    const artist = listening.state ? ` by ${listening.state}` : "";
    return `Listening to ${listening.name}${artist}`;
  }

  const activity = activities.find((item) => item.type !== 0);
  if (activity?.name) return activity.name;

  return "";
}

function getDiscordGame(activities = []) {
  const game = activities.find((activity) => activity.type === 0);
  return game?.name || "";
}

function getLargestLastfmImage(images = []) {
  const validImages = images.map((image) => image["#text"]).filter(Boolean);
  return validImages.at(-1) || "";
}

function emptyStatusMarkup(title, detail, statusClass) {
  return `
    <div class="avatar"></div>
    <div class="status-content">
      <div class="status-topline">
        <span class="status-name">${escapeHtml(title)}</span>
        <span class="status-pill ${escapeAttr(statusClass)}">Offline</span>
      </div>
      <p class="status-detail status-empty">${escapeHtml(detail)}</p>
    </div>
  `;
}

function emptyMusicMarkup(title, detail) {
  return `
    <div class="album-art"></div>
    <div class="status-content">
      <div class="status-topline">
        <span class="status-name">${escapeHtml(title)}</span>
        <span class="status-pill offline">Recent</span>
      </div>
      <p class="status-detail status-empty">${escapeHtml(detail)}</p>
    </div>
  `;
}

function timeStamp() {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}