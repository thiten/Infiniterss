// ==================== Estado ====================
let feeds = JSON.parse(localStorage.getItem('rssgram_feeds') || '[]');
let allItems = [];          // todos os posts carregados
let shuffledItems = [];     // versão embaralhada
let currentIndex = 0;
let orderMode = 'date';
let isLoading = false;
const BATCH_SIZE = 6;

// ==================== Elementos ====================
const feedEl       = document.getElementById('feed');
const loaderEl     = document.getElementById('loader');
const modal        = document.getElementById('feedsModal');
const feedsListEl  = document.getElementById('feedsList');
const feedNameEl   = document.getElementById('feedName');
const feedUrlEl    = document.getElementById('feedUrl');
const orderModeEl  = document.getElementById('orderMode');

// ==================== Feeds padrão (primeira vez) ====================
if (feeds.length === 0) {
  feeds = [
    { name: 'G1',   url: 'https://g1.globo.com/rss/g1/' },
    { name: 'BBC',  url: 'https://feeds.bbci.co.uk/news/rss.xml' }
  ];
  saveFeeds();
}

function saveFeeds() {
  localStorage.setItem('rssgram_feeds', JSON.stringify(feeds));
}

// ==================== Modal ====================
document.getElementById('settingsBtn').onclick = () => {
  renderFeedsList();
  modal.classList.add('active');
};
document.getElementById('closeModalBtn').onclick = () => {
  modal.classList.remove('active');
  loadAllFeeds(); // recarrega se mudou
};

document.getElementById('addFeedBtn').onclick = () => {
  const name = feedNameEl.value.trim();
  const url  = feedUrlEl.value.trim();
  if (!name || !url) return alert('Preencha nome e URL');
  feeds.push({ name, url });
  saveFeeds();
  renderFeedsList();
  feedNameEl.value = '';
  feedUrlEl.value = '';
};

function renderFeedsList() {
  feedsListEl.innerHTML = '';
  feeds.forEach((f, i) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span><strong>${f.name}</strong><br><small>${f.url}</small></span>
      <button data-index="${i}">Remover</button>
    `;
    li.querySelector('button').onclick = () => {
      feeds.splice(i, 1);
      saveFeeds();
      renderFeedsList();
    };
    feedsListEl.appendChild(li);
  });
}

// ==================== Modo de ordenação ====================
orderModeEl.onchange = () => {
  orderMode = orderModeEl.value;
  rebuildQueue();
  feedEl.innerHTML = '';
  currentIndex = 0;
  renderBatch();
};

// ==================== Carregamento de RSS ====================
async function fetchFeed(feed) {
  // AllOrigins contorna CORS
  const proxied = `https://api.allorigins.win/get?url=${encodeURIComponent(feed.url)}`;
  try {
    const res = await fetch(proxied);
    const data = await res.json();
    const xml = new DOMParser().parseFromString(data.contents, 'text/xml');

    // Detecta RSS 2.0 ou Atom
    const isAtom = xml.querySelector('feed') !== null;
    const items = isAtom
      ? [...xml.querySelectorAll('entry')]
      : [...xml.querySelectorAll('item')];

    return items.map(item => parseItem(item, feed, isAtom)).filter(Boolean);
  } catch (err) {
    console.warn(`Erro ao carregar ${feed.name}:`, err);
    return [];
  }
}

function parseItem(item, feed, isAtom) {
  const getText = (tag) => item.querySelector(tag)?.textContent?.trim() || '';

  const title = getText('title');
  const link  = isAtom
    ? item.querySelector('link')?.getAttribute('href') || ''
    : getText('link');

  const dateStr = isAtom ? getText('updated') : getText('pubDate');
  const date = dateStr ? new Date(dateStr) : new Date();

  // Imagem principal
  let image = extractImage(item, isAtom);

  return {
    title,
    link,
    date,
    image,
    source: feed.name,
    initial: feed.name.charAt(0).toUpperCase()
  };
}

function extractImage(item, isAtom) {
  // 1. media:content / media:thumbnail
  const media = item.querySelector('content[url], thumbnail[url]');
  if (media) return media.getAttribute('url');

  // 2. enclosure (RSS)
  const enclosure = item.querySelector('enclosure[type^="image"]');
  if (enclosure) return enclosure.getAttribute('url');

  // 3. Procura <img> no conteúdo HTML
  const content = item.querySelector('encoded, content, description, summary')?.textContent || '';
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) return imgMatch[1];

  // 4. Fallback: imagem em URL Open Graph
  const link = isAtom
    ? item.querySelector('link')?.getAttribute('href')
    : item.querySelector('link')?.textContent;
  if (link) {
    try {
      const domain = new URL(link).origin;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;
    } catch {}
  }
  return 'https://via.placeholder.com/500x500/efefef/8e8e8e?text=Sem+Imagem';
}

// ==================== Carrega todos os feeds ====================
async function loadAllFeeds() {
  if (isLoading) return;
  isLoading = true;
  loaderEl.classList.add('active');

  const results = await Promise.all(feeds.map(fetchFeed));
  allItems = results.flat();

  rebuildQueue();

  feedEl.innerHTML = '';
  currentIndex = 0;
  loaderEl.classList.remove('active');
  isLoading = false;

  if (allItems.length === 0) {
    feedEl.innerHTML = '<p style="text-align:center;padding:40px;color:#8e8e8e;">Nenhum post encontrado. Adicione feeds válidos em ⚙️</p>';
    return;
  }
  renderBatch();
}

function rebuildQueue() {
  const sorted = [...allItems].sort((a, b) => b.date - a.date);
  if (orderMode === 'random') {
    shuffledItems = [...sorted];
    for (let i = shuffledItems.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledItems[i], shuffledItems[j]] = [shuffledItems[j], shuffledItems[i]];
    }
  } else {
    shuffledItems = sorted;
  }
}

// ==================== Renderização ====================
function renderBatch() {
  const batch = shuffledItems.slice(currentIndex, currentIndex + BATCH_SIZE);
  batch.forEach(renderPost);
  currentIndex += BATCH_SIZE;
}

function renderPost(item) {
  const post = document.createElement('article');
  post.className = 'post';

  const dateStr = item.date.toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });

  post.innerHTML = `
    <div class="post-header">
      <div class="post-avatar">${item.initial}</div>
      <div>
        <div class="post-source">${item.source}</div>
        <div class="post-date">${dateStr}</div>
      </div>
    </div>
    <img class="post-image" src="${item.image}" alt="" loading="lazy"
         onerror="this.src='https://via.placeholder.com/500x500/efefef/8e8e8e?text=Sem+Imagem'">
    <div class="post-caption">
      <span class="source-name">${item.source}</span>
      <a href="${item.link}" target="_blank" rel="noopener">${item.title}</a>
    </div>
  `;
  feedEl.appendChild(post);
}

// ==================== Scroll Infinito ====================
window.addEventListener('scroll', () => {
  if (isLoading) return;
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 800) {
    if (currentIndex < shuffledItems.length) {
      renderBatch();
    } else if (orderMode === 'random' && shuffledItems.length > 0) {
      // Em modo aleatório, embaralha de novo infinitamente
      rebuildQueue();
      currentIndex = 0;
      renderBatch();
    }
  }
});

// ==================== Inicialização ====================
loadAllFeeds();
