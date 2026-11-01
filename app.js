let items = JSON.parse(localStorage.getItem('secure_shopping_items')) || [];
let systemPassword = localStorage.getItem('secure_app_password');
let audioUnlocked = false;

// 🔑 INSERISCI QUI LA TUA CHIAVE API GRATUITA DI OCR.SPACE (Prendila gratis su ocr.space/ocrapi)
// Se lasci "helloworld", l'app userà la chiave pubblica e attiverà il fallback locale in caso di errore.
const MY_OCR_API_KEY = "helloworld"; 

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

function parseQuantityAndName(rawInput) {
    let text = rawInput.trim();
    text = text.replace(/^(pacchi di|pacco di|bottiglie di|bottiglia di|kg di|chili di|pezzi di|pezzo di|x)\s+/i, '');
    const match = text.match(/^(\d+)\s+(.+)$/);
    
    if (match) {
        let quantity = parseInt(match[1], 10);
        let name = match[2].trim();
        name = name.replace(/^(di|del|dei|delle)\s+/i, '');
        return { quantity, name };
    }
    return { quantity: 1, name: text };
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
                notifyUser(`✏️ Quantità modificata: ${item.name} (${qty})`, `Quantità modificata per ${item.name}.`, 'info');
            }
            return { ...item, quantity: qty };
        }
        return item;
    });
    saveItems();
    renderItems();
}

// Funzione OCR con reindirizzamento d'emergenza integrato in locale se il server è sovraccarico
function scanImage(input) {
    if (!input.files || input.files.length === 0) return;
    unlockAudio();
    
    const file = input.files[0];
    const btnScan = document.getElementById('btn-scan');
    const originalText = btnScan.innerHTML;
    
    btnScan.disabled = true;
    btnScan.style.opacity = "0.6";
    btnScan.innerText = "⏳ Analisi...";
    
    notifyUser("🔍 Lettura immagine...", "Analisi in corso.", "info");

    const reader = new FileReader();
    reader.onload = function(e) {
        const base64String = e.target.result;

        const formData = new FormData();
        formData.append("base64Image", base64String);
        formData.append("language", "ita");
        formData.append("isOverlayRequired", "false");
        formData.append("scale", "true");
        formData.append("apikey", MY_OCR_API_KEY); 

        // Tentativo primario via Cloud ad alta precisione
        fetch("https://ocr.space", {
            method: "POST",
            body: formData
        })
        .then(response => {
            if (!response.ok) throw new Error("Server saturo");
            return response.json();
        })
        .then(result => {
            if (result && result.ParsedResults && result.ParsedResults.length > 0) {
                processOcrText(result.ParsedResults[0].ParsedText);
            } else {
                throw new Error("Formato non valido");
            }
        })
        .catch(err => {
            console.warn("Server cloud occupato. Attivazione fallback locale hardware...", err);
            notifyUser("⚙️ Modalità locale", "Server cloud occupato. Elaboro sul telefono.", "info");
            
            // FALLBACK LOCALE AUTOMATICO: Se internet o il server falliscono, usa l'hardware del telefono
            if ('BarcodeDetector' in window) {
                const img = new Image();
                img.onload = function() {
                    const barcodeDetector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'qr_code'] });
                    barcodeDetector.detect(img).then(barcodes => {
                        if (barcodes.length > 0) {
                            processOcrText(`1 Prodotto_${barcodes[0].rawValue}`);
                        } else {
                            notifyUser("❌ Lettura fallita", "Immagine non chiara. Riprova o scrivi a mano.", "danger");
                        }
                    }).catch(() => notifyUser("❌ Errore fotocamera", "Impossibile leggere l'immagine.", "danger"));
                };
                img.src = base64String;
            } else {
                notifyUser("❌ Errore", "Server momentaneamente occupato. Riprova.", "danger");
            }
        })
        .finally(() => {
            btnScan.disabled = false;
            btnScan.style.opacity = "1";
            btnScan.innerHTML = originalText;
            input.value = "";
        });
    };
    reader.readAsDataURL(file);
}

// Funzione interna isolata per elaborare le righe di testo pulito
function processOcrText(text) {
    if (!text || text.trim() === "") return;
    const lines = text.split(/\r?\n/);
    let aggiuntiCount = 0;
    let aggiornatiCount = 0;
    
    lines.forEach(line => {
        let cleanLine = line.replace(/[\s€]+$/, '').trim();
        cleanLine = cleanLine.replace(/[\\|#*_\-\[\]\{\}\/]/g, '').trim();

        if (cleanLine.length > 2) {
            const parsed = parseQuantityAndName(cleanLine);
            if (parsed.name.length > 2 && isNaN(parsed.name)) {
                const existingItem = items.find(item => item.name.toLowerCase() === parsed.name.toLowerCase() && !item.isPromo);
                if (existingItem) {
                    existingItem.quantity += parsed.quantity;
                    aggiornatiCount++;
                } else {
                    items.push({ id: Date.now() + Math.random(), name: parsed.name, isPromo: false, completed: false, quantity: parsed.quantity });
                    aggiuntiCount++;
                }
            }
        }
    });
    saveItems();
    renderItems();
    notifyUser(`🛒 Importati +${aggiuntiCount} articoli`, `Scansione completata.`, 'info');
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
        const newItem = { id: Date.now(), name: parsed.name, isPromo: isPromo, completed: false, quantity: parsed.quantity };
        items.push(newItem);
        notifyUser(`🛒 Aggiunto: ${parsed.name} (x${parsed.quantity})`, `Aggiunto ${parsed.name}, quantità ${parsed.quantity}`);
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
