const MODERATION_API = 'http://127.0.0.1:3000/moderation/analyzeComment';

console.log("SafeSpace Lite content script loaded!");

// === BADGE HELPERS ===

function createStatusBadge(type) {
  const badge = document.createElement('span');
  badge.className = 'toxicity-badge';
  badge.style.display = 'inline-block';
  badge.style.verticalAlign = 'middle';
  badge.style.marginLeft = '9px';
  badge.style.padding = '2px 10px';
  badge.style.borderRadius = '14px';
  badge.style.fontSize = '13px';
  badge.style.fontWeight = '600';
  badge.style.letterSpacing = '0.06em';
  badge.style.boxShadow = '0 2px 7px rgba(44,203,113,0.08)';
  badge.style.userSelect = 'none';
  badge.style.transition = 'background 0.19s, box-shadow 0.2s';

  switch (type) {
    case 'alert':
      badge.style.background = '#f44336';
      badge.style.color = '#fff';
      badge.textContent = '❗ Suspected';
      badge.title = 'Suspected: Potentially harmful or toxic email';
      break;
    case 'warning':
      badge.style.background = 'linear-gradient(90deg,#ffd600,#ffe082)';
      badge.style.color = '#333';
      badge.textContent = '⚠️ Warning';
      badge.title = 'Warning: Possible risk';
      break;
    default:
      badge.style.background = '#2ecc71';
      badge.style.color = '#fff';
      badge.textContent = '✓ Safe';
      badge.title = 'Safe: No toxicity detected';
      break;
  }
  return badge;
}

function createLoadingBadge() {
  const badge = document.createElement('span');
  badge.className = 'toxicity-badge';
  badge.style.display = 'inline-block';
  badge.style.verticalAlign = 'middle';
  badge.style.marginLeft = '9px';
  badge.style.padding = '2px 10px';
  badge.style.borderRadius = '14px';
  badge.style.fontSize = '13px';
  badge.style.background = '#ececec';
  badge.style.color = '#666';
  badge.textContent = '… Scanning';
  badge.title = 'Checking for toxicity...';
  return badge;
}

// === MAIN LOGIC ===

function updateStatusIcon(row, rating) {
  let existingBadge = row.querySelector('.toxicity-badge');
  if (existingBadge) existingBadge.remove();

  let badge;
  if (rating > 7) {
    badge = createStatusBadge('alert');
  } else if (rating > 4) {
    badge = createStatusBadge('warning');
  } else {
    badge = createStatusBadge('safe');
  }

  const lastTd = row.querySelector('td:last-child');
  if (lastTd) {
    lastTd.appendChild(badge);
  }

  // Blur the row if suspected (rating > 7)
  if (rating > 7) {
    row.style.filter = 'blur(2px)';
    row.style.transition = 'filter 0.2s';
    row.title = 'This email appears toxic or harmful. Blurred for safety.';
  } else {
    row.style.filter = '';
    row.title = '';
  }
}

function extractEmailText(row) {
  const subject = row.querySelector('.bog')?.innerText || '';
  const snippet = row.querySelector('.y2')?.innerText || '';
  return (subject + ' ' + snippet).trim();
}

function base64EncodeUnicode(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) =>
      String.fromCharCode('0x' + p1)
    )
  );
}

const CLIENT_CACHE_KEY_PREFIX = 'SafeSpaceLite_ToxicityResult_';

function getCachedResult(text) {
  const key = CLIENT_CACHE_KEY_PREFIX + base64EncodeUnicode(text);
  const cached = localStorage.getItem(key);
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

function setCachedResult(text, result) {
  const key = CLIENT_CACHE_KEY_PREFIX + base64EncodeUnicode(text);
  const data = {
    cachedAt: Date.now(),
    result,
  };
  localStorage.setItem(key, JSON.stringify(data));
}

function isCacheValid(data) {
  if (!data || !data.cachedAt) return false;
  const ageMs = Date.now() - data.cachedAt;
  return ageMs < 24 * 60 * 60 * 1000; // 1 day
}

async function moderateRowsBatch(rows) {
  const itemsToScan = [];
  for (const row of rows) {
    if (row.querySelector('.toxicity-badge')) continue;
    
    const emailText = extractEmailText(row);
    if (!emailText) continue;

    const cachedData = getCachedResult(emailText);
    if (cachedData && isCacheValid(cachedData)) {
      updateStatusIcon(row, cachedData.result.rating);
      continue;
    }

    let existingBadge = row.querySelector('.toxicity-badge');
    if (existingBadge) existingBadge.remove();
    const lastTd = row.querySelector('td:last-child');
    if (lastTd) lastTd.appendChild(createLoadingBadge());

    itemsToScan.push({ row, text: emailText });
  }

  if (itemsToScan.length === 0) return;

  const texts = itemsToScan.map(item => item.text);

  try {
    const res = await fetch(MODERATION_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
    });
    if (!res.ok) {
      console.error('API response not OK:', res.status, await res.text());
      // Apply error badge to prevent infinite retries
      for (const item of itemsToScan) {
        let existingBadge = item.row.querySelector('.toxicity-badge');
        if (existingBadge) {
          existingBadge.style.background = '#9e9e9e';
          existingBadge.style.color = '#fff';
          existingBadge.textContent = '❌ API Error';
          existingBadge.title = 'Rate limit or API error';
        }
      }
      return;
    }
    const data = await res.json();
    if (data.results && Array.isArray(data.results)) {
      for (let i = 0; i < data.results.length; i++) {
        const item = itemsToScan[i];
        const result = data.results[i];
        if (result && result.rating !== undefined) {
          setCachedResult(item.text, result);
          updateStatusIcon(item.row, result.rating);
        }
      }
    }
  } catch (err) {
    console.error('Moderation API error:', err);
    // Apply error badge to prevent infinite retries
    for (const item of itemsToScan) {
      let existingBadge = item.row.querySelector('.toxicity-badge');
      if (existingBadge) {
        existingBadge.style.background = '#9e9e9e';
        existingBadge.style.color = '#fff';
        existingBadge.textContent = '❌ API Error';
        existingBadge.title = 'Rate limit or API error';
      }
    }
  }
}

let isScanning = false;
async function scanInboxSequential() {
  if (isScanning) return;
  isScanning = true;
  try {
    const rows = Array.from(document.querySelectorAll('tr.zA')).slice(0, 5);
    await moderateRowsBatch(rows);
  } finally {
    isScanning = false;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "runModerationCheck") {
    scanInboxSequential().then(() => {
      sendResponse({ result: "Moderation completed." });
    });
    return true;
  }
});

const observer = new MutationObserver(() => {
  scanInboxSequential();
});
observer.observe(document.body, { childList: true, subtree: true });

scanInboxSequential();

// === Optional: App badge hover style ===
const css = `
.toxicity-badge {
  font-family: 'Segoe UI', Arial, sans-serif;
  cursor: default;
  transition: background 0.19s, box-shadow 0.2s;
}
.toxicity-badge:hover {
  filter: brightness(1.07) drop-shadow(0 2px 8px #fff4);
  box-shadow: 0 2px 15px rgba(44,203,113,0.12), 0 1px 7px rgba(0,0,0,0.13);
}
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);
