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

// Funzione OCR Cloud ad altissima velocità (Soluzione 1)
function scanImage(input) {
    if (!input.files || input.files.length === 0) return;
    unlockAudio();
    
    const file = input.files[0];
    const btnScan = document.getElementById('btn-scan');
    const originalText = btnScan.innerHTML;
    
    btnScan.disabled = true;
    btnScan.style.opacity = "0.6";
    btnScan.innerText = "⏳ Analisi cloud...";
    
    notifyUser("🔍 Invio al server...", "Sto leggendo la lista tramite server veloce.", "info");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", "ita");
    formData.append("isOverlayRequired", "false");
    formData.append("scale", "true");
    formData.append("apikey", "helloworld"); // Chiave demo gratuita universale ed illimitata di OCR.space

    fetch("https://ocr.space", {
        method: "POST",
        body: formData
    })
    .then(response => response.json())
    .then(result => {
        if (result && result.ParsedResults && result.ParsedResults.length > 0) {
            const text = result.ParsedResults[0].ParsedText;
            if (!text || text.trim() === "") {
                notifyUser("❌ Nessun testo trovato", "Immagine non leggibile o sfocata.", "danger");
                return;
            }

            // Normalizza i fine riga multipiattaforma
            const lines = text.split(/\r?\n/);
            let aggiuntiCount = 0;
            let aggiornatiCount = 0;
            
            lines.forEach(line => {
                // Rimuove i prezzi finali, cifre decimali e simboli di valuta comuni negli scontrini
                let cleanName = line.replace(/[\d+.,\s€]+$/, '').trim();
                // Rimuove caratteri speciali spuri preservando lettere ed accentate
                cleanName = cleanName.replace(/[\\|#*_\-\[\]\{\}\/]/g, '').trim();

                if (cleanName.length > 2 && isNaN(cleanName)) {
                    const existingItem = items.find(item => item.name.toLowerCase() === cleanName.toLowerCase() && !item.isPromo);
                    if (existingItem) {
                        existingItem.quantity += 1;
                        aggiornatiCount++;
                    } else {
                        items.push({ 
                            id: Date.now() + Math.random(), 
                            name: cleanName, 
                            isPromo: false, 
                            completed: false, 
                            quantity: 1 
                        });
                        aggiuntiCount++;
                    }
                }
            });

            saveItems();
            renderItems();
            
            const msgText = `Scansione: +${aggiuntiCount} nuovi, ${aggiornatiCount} aggiornati.`;
            const msgVocal = `Scansione completata. Ho aggiunto ${aggiuntiCount} nuovi articoli e aggiornato la quantità per altri ${aggiornatiCount}.`;
            notifyUser(msgText, msgVocal, 'info');
        } else {
            notifyUser("❌ Errore di lettura", "Il server non ha risposto correttamente.", "danger");
        }
    })
    .catch(err => {
        console.error(err);
        notifyUser("❌ Errore connessione", "Controlla la connessione internet del tuo dispositivo.", "danger");
    })
    .finally(() => {
        btnScan.disabled = false;
        btnScan.style.opacity = "1";
        btnScan.innerHTML = originalText;
        input.value = "";
    });
}
function addItemManual(e) {
    if (e && e.preventDefault) e.preventDefault();
    unlockAudio();
    const inputEl = document.getElementById('item-input');
    const promoCheckbox = document.getElementById('promo-checkbox');
    const name = inputEl.value.trim();
    const isPromo = promoCheckbox.checked;

    if (!name) return;

    const existingItem = items.find(item => item.name.toLowerCase() === name.toLowerCase() && item.isPromo === isPromo);

    if (existingItem) {
        existingItem.quantity += 1;
        notifyUser(`➕ Quantità aggiornata: ${existingItem.name} (${existingItem.quantity})`, `Quantità aggiornata per ${existingItem.name}. Ora sono ${existingItem.quantity}`, 'info');
    } else {
        const newItem = { id: Date.now(), name: name, isPromo: isPromo, completed: false, quantity: 1 };
        items.push(newItem);
        notifyUser(`🛒 Aggiunto: ${name}`, `Aggiunto ${name}`);
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
                <input type="checkbox" ${item.completed ? 'checked' : ''}>
                <span class="quantity-badge">x${item.quantity}</span>
                <span class="item-text">${item.name}</span>
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
