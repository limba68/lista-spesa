let items = JSON.parse(localStorage.getItem('secure_shopping_items')) || [];
let systemPassword = localStorage.getItem('secure_app_password');
let audioUnlocked = false;

document.addEventListener('DOMContentLoaded', () => {
    if (!systemPassword) {
        const titleEl = document.getElementById('login-title');
        const descEl = document.getElementById('login-desc');
        if (titleEl) titleEl.innerText = '🆕 Imposta Password';
        if (descEl) descEl.innerText = 'Scegli un codice segreto di sblocco per questa applicazione.';
    }
});

function unlockAudio() {
    if (audioUnlocked) return;
    if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance('');
        window.speechSynthesis.speak(u);
        audioUnlocked = true;
    }
}

function checkPassword(e) {
    e.preventDefault();
    unlockAudio();
    const input = document.getElementById('password-input').value;
    if (!systemPassword) {
        if (input.trim().length < 4) { alert("Usa almeno 4 caratteri."); return; }
        localStorage.setItem('secure_app_password', input); systemPassword = input; unlockApp();
    } else {
        if (input === systemPassword) { unlockApp(); } else { alert("Password errata!"); document.getElementById('password-input').value = ''; }
    }
}

function unlockApp() { 
    document.getElementById('login-screen').style.display = 'none'; 
    document.getElementById('app-screen').style.display = 'block'; 
    renderItems(); 
}

function logout() { 
    document.getElementById('password-input').value = ''; 
    document.getElementById('app-screen').style.display = 'none'; 
    document.getElementById('login-screen').style.display = 'flex'; 
}

function saveItems() { localStorage.setItem('secure_shopping_items', JSON.stringify(items)); }

function notifyUser(textMessage, vocalMessage, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = textMessage;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3500);

    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 
        const utterance = new SpeechSynthesisUtterance(vocalMessage);
        utterance.lang = 'it-IT';
        utterance.rate = 1.1; 
        window.speechSynthesis.speak(utterance);
    }
}

// Nuova logica di estrazione vocale rinforzata contro abbreviazioni, punti e spazi
function parseQuantityAndName(rawInput) {
    let text = rawInput.trim().toLowerCase();
    
    // 1. Rimuove prefissi testuali ed espressioni come "numero", "n.", "n°", "pezzi di" ovunque all'inizio
    text = text.replace(/^(numero|n\.|n°|pezzi di|pezzo di|pacchi di|pacco di|bottiglie di|bottiglia di|quantità|q\.ta|x)\s*/g, '');
    
    // 2. Rimuove ulteriormente eventuali punti o spazi rimasti attaccati (es: ".3" o " . 3")
    text = text.replace(/^[\.\s°#\-x]+/g, '').trim();

    // 3. Intercetta il numero e isola il testo rimanente del prodotto
    const match = text.match(/^(\d+)\s+(.+)$/);
    
    if (match) {
        let quantity = parseInt(match[1], 10);
        let name = match[2].trim();
        
        // Rimuove parole di raccordo residue inserite dalla sintesi vocale (es: "3 di pane" -> "pane")
        name = name.replace(/^(di numero pezzi|di numero pezzo|numero pezzi|pezzi di|pezzo di|di|del|dei|delle)\s+/g, '');
        
        // Ripristina la prima lettera maiuscola per estetica nella lista
        name = name.charAt(0).toUpperCase() + name.slice(1);
        
        return { quantity, name };
    }
    
    // Se non viene rilevato alcun numero iniziale, imposta quantità 1 e applica la maiuscola
    let defaultName = text.charAt(0).toUpperCase() + text.slice(1);
    return { quantity: 1, name: defaultName };
}

function updateQuantityManual(id, newQuantity) {
    unlockAudio();
    const qty = parseInt(newQuantity, 10);
    
    if (isNaN(qty) || qty <= 0) {
        deleteItem(id);
        return;
    }

    items = items.map(item => {
        if (item.id === id) {
            if (item.quantity !== qty) {
                notifyUser(`✏️ Quantità modificata: ${item.name} (${qty})`, `Quantità aggiornata per ${item.name}. Ora sono ${qty}`, 'info');
            }
            return { ...item, quantity: qty };
        }
        return item;
    });

    saveItems();
    renderItems();
}
function addItemManual(e) {
    if (e && e.preventDefault) e.preventDefault();
    unlockAudio();
    const inputEl = document.getElementById('item-input');
    const promoCheckbox = document.getElementById('promo-checkbox');
    const rawInput = inputEl.value.trim();
    const isPromo = promoCheckbox.checked;

    if (!rawInput) return;

    const parsed = parseQuantityAndName(rawInput);
    const existingItem = items.find(item => item.name.toLowerCase() === parsed.name.toLowerCase() && item.isPromo === isPromo);

    if (existingItem) {
        existingItem.quantity += parsed.quantity;
        notifyUser(`➕ Quantità aggiornata: ${existingItem.name} (${existingItem.quantity})`, `Quantità aggiornata per ${existingItem.name}. Ora sono ${existingItem.quantity}`, 'info');
    } else {
        const newItem = { 
            id: Date.now(), 
            name: parsed.name, 
            isPromo: isPromo, 
            completed: false, 
            quantity: parsed.quantity 
        };
        items.push(newItem);
        notifyUser("🛒 Aggiunto: " + parsed.name + " (x" + parsed.quantity + ")", "Aggiunto " + parsed.name + ", quantità " + parsed.quantity);
    }

    inputEl.value = '';
    promoCheckbox.checked = false;
    saveItems();
    renderItems();
}

function renderItems() {
    const listEl = document.getElementById('shopping-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    items.forEach(item => {
        const li = document.createElement('li');
        if (item.completed) li.classList.add('completed');
        if (item.isPromo) li.classList.add('is-promo-item');

        li.innerHTML = `
            <div class="item-content" onclick="toggleComplete(${item.id})">
                <input type="checkbox" ${item.completed ? 'checked' : ''} style="margin-right: 4px;">
                <input type="number" value="${item.quantity}" min="1" max="99" 
                       onclick="event.stopPropagation()" 
                       onchange="updateQuantityManual(${item.id}, this.value)" 
                       style="width: 50px; padding: 4px 2px; text-align: center; font-weight: bold; border: 1px solid var(--border); border-radius: 4px; margin-right: 8px; font-size: 1rem; color: var(--dark); background: #edf2f7;">
                <span class="item-text" style="flex: 1;">${item.name}</span>
                ${item.isPromo ? '<span class="promo-badge">% PROMO</span>' : ''}
            </div>
            <button class="btn-delete" onclick="event.stopPropagation(); deleteItem(${item.id})">❌</button>
        `;
        listEl.appendChild(li);
    });
}

function toggleComplete(id) {
    items = items.map(item => item.id === id ? { ...item, completed: !item.completed } : item);
    saveItems();
    renderItems();
}

function deleteItem(id) {
    unlockAudio();
    const itemToDelete = items.find(item => item.id === id);
    if (itemToDelete) {
        notifyUser(`🗑️ Rimosso: ${itemToDelete.name}`, `Articolo ${itemToDelete.name} rimosso dalla lista`, 'danger');
        items = items.filter(item => item.id !== id);
        saveItems();
        renderItems();
    }
}

function clearAllItems() {
    if (items.length === 0) return;
    unlockAudio();
    if (confirm("Sei sicuro di voler svuotare l'intera lista della spesa?")) {
        items = [];
        notifyUser("🚨 Intera lista svuotata!", "Lista della spesa svuotata completamente", "danger");
        saveItems();
        renderItems();
    }
}

function startVoiceRecognition() {
    unlockAudio();
    const btn = document.getElementById('btn-vocal');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        alert("Il riconoscimento vocale non è supportato o richiede permessi espliciti su questo browser mobile.");
        return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'it-IT';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onstart = () => { btn.classList.add('listening'); btn.innerText = '⏳ Ascolto...'; };
    recognition.onend = () => { btn.classList.remove('listening'); btn.innerText = '🎙️ Parla'; };
    
    recognition.onresult = (event) => {
        if (event.results && event.results[0] && event.results[0][0]) {
            const text = event.results[0][0].transcript;
            if (text && text.trim()) {
                document.getElementById('item-input').value = text;
                addItemManual();
            }
        }
    };
    
    recognition.onerror = () => { btn.classList.remove('listening'); btn.innerText = '🎙️ Parla'; };
    recognition.start();
}
