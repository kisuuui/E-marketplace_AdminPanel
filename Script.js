// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyC75Zmb17vj7K3HeQKiHxbKvAzGIQmqQw4",
    authDomain: "e-campus-marketplace.firebaseapp.com",
    projectId: "e-campus-marketplace",
    storageBucket: "e-campus-marketplace.firebasestorage.app",
    messagingSenderId: "920245597144",
    appId: "1:920245597144:web:b2d1b5a74d562968f478ad",
    measurementId: "G-0L7G265Q5F"
};

const ALLOWED_ADMINS = ["admin@scc.edu.ph", "justinvenedict.scc@gmail.com"];

// --- INITIALIZATION ---
let auth, db; 
// Note: 'storage' is removed because we are now using Cloudinary

try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    db = firebase.firestore();
    console.log("Firebase Active");
} catch (e) {
    console.error("Init Error:", e);
}

let globalUsers = [], globalProducts = [];
let currentTab = 'customers';

// --- CLOUDINARY UPLOAD HELPER (NEW) ---
async function uploadToCloudinary(file) {
    const cloudName = "dokaqnqg6"; 
    const uploadPreset = "e-marketplace";

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) throw new Error("Cloudinary Upload Failed");

        const data = await response.json();
        return data.secure_url; // Returns the internet-ready link
        
    } catch (error) {
        console.error("Upload Error:", error);
        throw error;
    }
}

// --- AUTHENTICATION ---
window.handleLogin = function() {
    const e = document.getElementById('loginEmail').value.trim();
    const p = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    const errorMsg = document.getElementById('loginError');

    if (btn) btn.textContent = "Verifying...";
    if (errorMsg) errorMsg.classList.add('hidden');

    auth.signInWithEmailAndPassword(e, p)
        .catch(err => {
            console.error("Login Failed", err);
            if (btn) btn.textContent = "Sign In";
            if (errorMsg) {
                errorMsg.innerHTML = `<i data-lucide="alert-circle" class="w-4 h-4"></i> <span>${err.message}</span>`;
                errorMsg.classList.remove('hidden');
                lucide.createIcons();
            }
        });
};

window.handleLogout = function() {
    auth.signOut().then(() => window.location.reload());
};

// --- AUTH LISTENER ---
auth.onAuthStateChanged(async (user) => {
    const login = document.getElementById('login-screen');
    const dash = document.getElementById('dashboard-container');
    const sidebar = document.getElementById('sidebar');

    if (user) {
        if (ALLOWED_ADMINS.some(admin => admin.toLowerCase() === user.email.toLowerCase())) {
            if (login) login.style.display = 'none';
            if (dash) dash.classList.remove('hidden');
            if (dash) dash.classList.add('flex');
            if (sidebar) sidebar.classList.remove('hidden'); 
            
            initDataListeners();
            await fetchAndSyncUserProfile(user);
        } else {
            alert("Access Denied: You are not an authorized admin.");
            auth.signOut();
        }
    } else {
        if (login) login.style.display = 'flex';
        if (dash) dash.classList.add('hidden');
        if (dash) dash.classList.remove('flex');
        if (sidebar) sidebar.classList.add('hidden');
    }
});

// --- PROFILE SYNC ---
async function fetchAndSyncUserProfile(user) {
    const userRef = db.collection('admin').doc(user.uid);
    try {
        const doc = await userRef.get();
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();

        if (doc.exists) {
            const data = doc.data();
            updateProfileUI(data.name || "Admin", data.role || "Admin", user.email, data.photoURL);
            await userRef.update({ lastLogin: timestamp });
        } else {
            const newProfile = { name: "Admin User", email: user.email, role: "Super Admin", createdAt: timestamp, lastLogin: timestamp };
            await userRef.set(newProfile);
            updateProfileUI(newProfile.name, newProfile.role, user.email);
        }
    } catch (error) { console.error("Profile Error", error); }
}

function updateProfileUI(name, role, email, photoURL) {
    document.querySelectorAll('.user-name').forEach(el => el.innerText = name);
    document.querySelectorAll('.user-role').forEach(el => el.innerText = role);
    
    const imgUrl = photoURL || `https://ui-avatars.com/api/?name=${name}&background=852221&color=fff`;
    const avatarIds = ['mp_img', 'sidebar-avatar', 'header-avatar', 'dropdown-avatar'];
    avatarIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.src = imgUrl;
    });
}

// --- DATA LISTENERS ---
function initDataListeners() {
    db.collection('products').orderBy('createdAt', 'desc').onSnapshot(snap => {
        globalProducts = [];
        snap.forEach(d => globalProducts.push({ id: d.id, ...d.data() }));
        renderProducts();
    });

    db.collection('users').orderBy('createdAt', 'desc').onSnapshot(snap => {
        globalUsers = [];
        snap.forEach(d => globalUsers.push({ id: d.id, ...d.data() }));
        renderUsers();
    });
}

// --- RENDER FUNCTIONS ---
function getStatusBadge(status) {
    const s = (status || '').toLowerCase();
    const base = "px-2 py-1 rounded text-xs font-bold";
    if (['in stock', 'active', 'verified'].includes(s)) return `${base} bg-green-100 text-green-600`;
    if (['out of stock', 'rejected', 'suspended'].includes(s)) return `${base} bg-red-100 text-red-600`;
    if (['low stock', 'pending'].includes(s)) return `${base} bg-orange-100 text-orange-600`;
    return `${base} bg-gray-100 text-gray-500`;
}

function renderProducts() {
    const tDashboard = document.querySelector('#productsTable tbody');
    const tAllItems = document.querySelector('#allItemsTable tbody');

    if (tDashboard) {
        tDashboard.innerHTML = globalProducts.slice(0, 5).map(p => {
            const name = p.Product || p.name || 'Unnamed';
            const price = p.Price || p.price || 0;
            const stock = p.Stock || p.stock || 0;
            const status = p.Status || p.status || 'Unknown';
            return `<tr class="border-b border-gray-50 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"><td class="py-3 pl-2 font-medium text-gray-700 dark:text-gray-300">${name}</td><td class="py-3 text-gray-600 dark:text-gray-400">₱${price}</td><td class="py-3 text-gray-600 dark:text-gray-400">${stock}</td><td class="py-3 text-right pr-2"><span class="${getStatusBadge(status)}">${status}</span></td></tr>`;
        }).join('');
    }

    if (tAllItems) {
        tAllItems.innerHTML = globalProducts.map(p => {
            const name = p.Product || p.name || 'Unnamed';
            const img = p.Image || p.imageUrl || `https://ui-avatars.com/api/?name=${name}&background=eee`;
            const cat = p.Category || p.category || '--';
            const recipient = p.Recipient || p.recipient || '--';
            const price = p.Price || p.price || 0;
            const stock = p.Stock || p.stock || 0;
            const status = p.Status || p.status || 'Unknown';
            
            return `
            <tr class="table-row-hover group border-b border-gray-50 dark:border-dark-border transition-colors">
                <td class="px-6 py-4 flex items-center gap-3">
                    <img src="${img}" class="w-10 h-10 rounded-lg object-cover border border-gray-100 shadow-sm">
                    <div><p class="font-bold text-gray-700 dark:text-gray-300 text-sm">${name}</p><p class="text-xs text-gray-400 font-mono">${p.id.substring(0,6)}...</p></div>
                </td>
                <td class="px-6 py-4 text-gray-600 dark:text-gray-400">${cat}</td>
                <td class="px-6 py-4 text-gray-600 dark:text-gray-400">${recipient}</td>
                <td class="px-6 py-4 font-bold text-gray-700 dark:text-gray-300">₱${price}</td>
                <td class="px-6 py-4 text-gray-600 dark:text-gray-400">${stock}</td>
                <td class="px-6 py-4 text-right"><span class="${getStatusBadge(status)}">${status}</span></td>
                <td class="px-6 py-4 text-right">
                    <button onclick="deleteItem('products', '${p.id}')" class="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition-all"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>
            </tr>`;
        }).join('');
    }
    lucide.createIcons();
}

function renderUsers() {
    const tCus = document.getElementById('tbody-customers');
    const tSel = document.getElementById('tbody-sellers');
    const tUnv = document.getElementById('tbody-unverified');
    
    if(tCus) tCus.innerHTML = '';
    if(tSel) tSel.innerHTML = '';
    if(tUnv) tUnv.innerHTML = '';

    globalUsers.forEach(u => {
        const name = u.name || 'Unknown';
        const role = u.role || 'User';
        const type = u.userType || u.type || 'Customer'; 
        const email = u.email || 'No Email';
        const isVerified = u.verified === true || u.status === 'Active'; 
        const img = `https://ui-avatars.com/api/?name=${name}&background=random&color=fff`;

        const row = `
        <tr class="border-b border-gray-50 dark:border-dark-border table-row-hover transition-colors">
            <td class="px-6 py-4 flex items-center gap-3">
                <img src="${img}" class="w-8 h-8 rounded-full shadow-sm">
                <div><p class="font-bold text-sm text-gray-700 dark:text-gray-300">${name}</p><p class="text-xs text-gray-400">${email}</p></div>
            </td>
            <td class="px-6 py-4 text-gray-600 dark:text-gray-400">${type}</td>
            <td class="px-6 py-4"><span class="badge-${role.toLowerCase()}">${role}</span></td>
            <td class="px-6 py-4">${isVerified ? '<span class="badge-verified">Verified</span>' : '<span class="text-red-500 font-bold text-xs bg-red-50 px-2 py-1 rounded">Unverified</span>'}</td>
            <td class="px-6 py-4 text-right">
                ${!isVerified ? `<button onclick="openVerifyModal('${u.id}', '${email}')" class="text-blue-600 hover:text-blue-800 text-xs font-bold mr-3 hover:underline">Verify</button>` : ''}
                <button onclick="deleteItem('users', '${u.id}')" class="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-all"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </td>
        </tr>`;

        if (!isVerified || u.status === 'Unverified') {
            tUnv.innerHTML += row;
        } else if (type === 'Seller' || type === 'Staff') {
            tSel.innerHTML += row;
        } else {
            tCus.innerHTML += row;
        }
    });
    
    lucide.createIcons();
}

// --- UI & SEARCH ---
function setupSearch() {
    const pInput = document.getElementById('productSearch');
    if (pInput) {
        pInput.addEventListener('input', (e) => {
            filterTable('allItemsTable', e.target.value.toLowerCase());
        });
    }

    const uInput = document.getElementById('userManagementSearch');
    if (uInput) {
        uInput.addEventListener('input', (e) => {
            if (!document.getElementById('tbody-customers').classList.contains('hidden')) filterTable('usersTable', e.target.value.toLowerCase());
        });
    }
}

function filterTable(tableId, term) {
    const rows = document.querySelectorAll(`#${tableId} tbody tr`);
    rows.forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
    });
}

// --- DROPDOWN LOGIC ---
window.toggleUserDropdown = function() {
    const dd = document.getElementById('userDropdown');
    const container = document.getElementById('userMenuContainer');
    
    if (dd.classList.contains('hidden')) {
        dd.classList.remove('hidden');
        setTimeout(() => {
            document.addEventListener('click', closeUserDropdownOutside);
        }, 10);
    } else {
        dd.classList.add('hidden');
        document.removeEventListener('click', closeUserDropdownOutside);
    }
};

function closeUserDropdownOutside(e) {
    const container = document.getElementById('userMenuContainer');
    const dd = document.getElementById('userDropdown');
    
    if (container && !container.contains(e.target)) {
        dd.classList.add('hidden');
        document.removeEventListener('click', closeUserDropdownOutside);
    }
}

// --- SAVE ACTIONS (Products via Cloudinary) ---
window.saveNewProduct = async function() {
    const name = document.getElementById('inp_name').value;
    const price = document.getElementById('inp_price').value;
    const stock = document.getElementById('inp_stock').value;
    const file = document.getElementById('inp_file').files[0];

    if (!name || !price) return alert("Please fill required fields");

    const saveBtn = document.querySelector('#addItemModal button.bg-primary');
    const orgText = saveBtn.textContent;
    saveBtn.textContent = "Uploading...";
    saveBtn.disabled = true;

    try {
        let imageUrl = "";

        // 1. UPLOAD TO CLOUDINARY
        if (file) {
            imageUrl = await uploadToCloudinary(file);
        } else {
            imageUrl = `https://ui-avatars.com/api/?name=${name}&background=eee`;
        }
        
        // 2. SAVE TO FIREBASE
        await db.collection('products').add({
            Product: name, 
            Price: Number(price),
            Stock: Number(stock),
            Category: document.getElementById('inp_category').value,
            Status: document.getElementById('inp_status').value,
            Recipient: document.getElementById('inp_recipient').value,
            Description: document.getElementById('inp_desc').value,
            Image: imageUrl, 
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        closeAndClearModal('addItemModal');
        alert("Product Saved!");
    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        saveBtn.textContent = orgText;
        saveBtn.disabled = false;
    }
};

window.saveNewUser = async function() {
    const email = document.getElementById('u_email').value;
    const pass = document.getElementById('u_pass').value;
    const name = document.getElementById('u_name').value;

    if (!name || !email || !pass) return alert("Missing fields");

    const saveBtn = document.querySelector('#addUserModal button.bg-primary');
    saveBtn.textContent = "Creating...";
    saveBtn.disabled = true;

    let secondaryApp = null;
    try {
        secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
        const cred = await secondaryApp.auth().createUserWithEmailAndPassword(email, pass);
        
        await db.collection('users').doc(cred.user.uid).set({
            name,
            email,
            role: document.getElementById('u_role').value,
            userType: document.getElementById('u_type').value,
            course: document.getElementById('u_course').value,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'Active',
            verified: true
        });
        
        await secondaryApp.auth().signOut();
        alert("User Created Successfully!");
        closeAndClearModal('addUserModal');
        
    } catch (e) {
        alert("Error creating user: " + e.message);
    } finally {
        if(secondaryApp) secondaryApp.delete(); 
        saveBtn.textContent = "Create User";
        saveBtn.disabled = false;
    }
};

window.deleteItem = async function(collection, id) {
    if(confirm("Are you sure you want to delete this record? This action cannot be undone.")) {
        try {
            await db.collection(collection).doc(id).delete();
        } catch (error) {
            alert("Error deleting: " + error.message);
        }
    }
};

// --- SAVE FINANCIAL RECORD (NEW) ---
window.saveFinancialRecord = async function() {
    const type = document.querySelector('input[name="trans_type"]:checked').value; 
    const amount = parseFloat(document.getElementById('fin_amount').value);
    const desc = document.getElementById('fin_desc').value;
    const dateVal = document.getElementById('fin_date').value;

    if (!amount || !desc) {
        return alert("Please enter both an amount and a description.");
    }

    const btn = document.querySelector('#addFinanceModal button.bg-[#852221]');
    const originalText = btn.textContent;
    btn.textContent = "Saving...";
    btn.disabled = true;

    try {
        let recordDate = dateVal ? new Date(dateVal) : new Date();
        
        await db.collection('financials').add({
            type: type,          
            amount: amount,      
            description: desc,   
            date: recordDate,    
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: auth.currentUser ? auth.currentUser.email : 'System'
        });

        alert("Transaction Saved Successfully!");
        closeAndClearModal('addFinanceModal');

    } catch (error) {
        console.error("Error saving finance record:", error);
        alert("Error: " + error.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
};

// --- MODAL & TAB UTILS ---
window.switchView = function(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    
    const target = document.getElementById('view-' + viewName);
    if(target) target.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(el => {
        el.className = 'nav-item flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border text-gray-600 dark:text-gray-400 cursor-pointer transition-colors group';
        const icon = el.querySelector('i');
        if(icon) {
             icon.classList.remove('text-white');
             icon.classList.remove('text-gray-400');
        }
    });

    const activeNav = document.getElementById('nav-' + viewName);
    if(activeNav) {
        activeNav.className = 'nav-item flex items-center justify-between px-3 py-2.5 rounded-lg active cursor-pointer transition-colors';
        const icons = activeNav.querySelectorAll('i');
        icons.forEach(i => i.classList.remove('group-hover:text-[#852221]'));
    }
    
    document.getElementById('userDropdown').classList.add('hidden');
    lucide.createIcons();
};

window.switchUserTab = function(type) {
    currentTab = type;
    document.querySelectorAll('[id^="tab-"]').forEach(b => {
        b.className = 'page-tab-inactive pb-3 text-sm font-medium border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors cursor-pointer';
        if(b.id === 'tab-unverified') b.classList.add('text-red-500');
    });

    const activeBtn = document.getElementById('tab-' + type);
    if(activeBtn) {
        activeBtn.className = (type === 'unverified') 
            ? 'page-tab-active-danger pb-3 text-sm font-bold border-b-2 border-red-500 text-red-600 cursor-pointer' 
            : 'page-tab-active pb-3 text-sm font-bold border-b-2 border-[#852221] text-[#852221] dark:text-red-400 cursor-pointer';
    }

    document.getElementById('tbody-customers').classList.add('hidden');
    document.getElementById('tbody-sellers').classList.add('hidden');
    document.getElementById('tbody-unverified').classList.add('hidden');
    
    const targetBody = document.getElementById('tbody-' + type);
    if(targetBody) targetBody.classList.remove('hidden');
};

window.openModal = function(id) { 
    document.getElementById(id)?.classList.add('open'); 
    document.getElementById('userDropdown').classList.add('hidden'); 
    
    // Set default date for finance modal
    if(id === 'addFinanceModal') {
        const dateInput = document.getElementById('fin_date');
        if(dateInput) dateInput.valueAsDate = new Date();
    }
};

window.closeModal = function(id) { document.getElementById(id)?.classList.remove('open'); };
window.closeAndClearModal = function(id) {
    document.querySelectorAll(`#${id} input, #${id} textarea`).forEach(i => i.value = '');
    closeModal(id);
};

window.openVerifyModal = function(uid, email) {
    document.getElementById('v_uid').value = uid;
    document.getElementById('v_email').value = email;
    openModal('verifyUserModal');
};

window.saveVerifiedUser = async function() {
    const uid = document.getElementById('v_uid').value;
    const name = document.getElementById('v_name').value;
    if(!name) return alert("Please confirm the user's name");

    await db.collection('users').doc(uid).update({
        name: name,
        userType: document.getElementById('v_type').value,
        role: document.getElementById('v_role').value,
        verified: true,
        status: 'Active'
    });
    closeModal('verifyUserModal');
    alert("User Verified successfully.");
};

window.openMyProfile = function() {
    const u = auth.currentUser;
    if(u) {
        document.getElementById('mp_email').value = u.email;
        document.getElementById('mp_uid').value = u.uid;
        document.getElementById('mp_name').value = document.querySelector('.user-name').innerText;
        document.getElementById('mp_role').value = document.querySelector('.user-role').innerText;
        document.getElementById('mp_img').src = document.getElementById('header-avatar').src;
        openModal('myProfileModal');
        document.getElementById('userDropdown').classList.add('hidden');
    }
};

window.saveMyProfile = async function() {
    const u = auth.currentUser;
    const name = document.getElementById('mp_name').value;
    const file = document.getElementById('mp_file').files[0];
    const btn = document.querySelector('#myProfileModal button.bg-primary');
    btn.textContent = "Updating..."; btn.disabled = true;
    try {
        let url = null;
        if(file) {
             url = await uploadToCloudinary(file);
        }
        await db.collection('admin').doc(u.uid).update({ name, ...(url && {photoURL: url}) });
        updateProfileUI(name, document.getElementById('mp_role').value, u.email, url || document.getElementById('mp_img').src);
        closeModal('myProfileModal');
        alert("Profile Updated!");
    } catch(e) { alert(e.message); } finally { btn.textContent = "Update"; btn.disabled = false; }
};

// --- DARK MODE LOGIC ---
function toggleTheme() {
    const html = document.documentElement;
    const themeIcon = document.getElementById('theme-icon');
    
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        if(themeIcon) themeIcon.setAttribute('data-lucide', 'moon'); 
    } else {
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        if(themeIcon) themeIcon.setAttribute('data-lucide', 'sun'); 
    }
    lucide.createIcons(); 
}

// Check saved theme on load
if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark');
}

// --- CALENDAR LOGIC (Interactive) ---
let currentCalendarDate = new Date(); 
let selectedFullDate = new Date(); 

function renderCalendar() {
    const monthYearEl = document.getElementById("calendar-month");
    const gridEl = document.getElementById("calendar-grid");
    
    if (!monthYearEl || !gridEl) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthYearEl.innerText = `${monthNames[month]} ${year}`;

    gridEl.innerHTML = "";

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    
    for (let i = 0; i < firstDayIndex; i++) {
        const blank = document.createElement("span");
        gridEl.appendChild(blank);
    }

    const today = new Date();

    for (let i = 1; i <= lastDay; i++) {
        const dayEl = document.createElement("span");
        dayEl.innerText = i;
        dayEl.className = "w-8 h-8 flex items-center justify-center rounded-full mx-auto cursor-pointer transition-all duration-200 text-sm";
        
        const isSelected = (i === selectedFullDate.getDate() && month === selectedFullDate.getMonth() && year === selectedFullDate.getFullYear());
        const isToday = (i === today.getDate() && month === today.getMonth() && year === today.getFullYear());

        if (isSelected) {
            dayEl.classList.add("bg-[#852221]", "text-white", "shadow-md", "shadow-red-200", "dark:shadow-none", "font-bold");
        } else if (isToday) {
            dayEl.classList.add("text-[#852221]", "font-bold", "border", "border-red-100", "dark:border-red-900");
        } else {
            dayEl.classList.add("hover:bg-gray-100", "dark:hover:bg-gray-800", "text-gray-600", "dark:text-gray-300");
        }

        dayEl.onclick = () => selectDay(i);
        gridEl.appendChild(dayEl);
    }
}

function selectDay(day) {
    selectedFullDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), day);
    renderCalendar();
    console.log(`User selected: ${selectedFullDate.toDateString()}`);
}

function changeMonth(direction) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + direction);
    renderCalendar();
}

// --- INITIALIZE (Final Loaded Sequence) ---
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    setupSearch();
    
    // Media Upload
    const mediaArea = document.querySelector('.media-upload-area');
    if(mediaArea) mediaArea.addEventListener('click', () => document.getElementById('inp_file').click());
    
    // Profile Image Preview
    const mpFile = document.getElementById('mp_file');
    if(mpFile) {
        mpFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = (e) => document.getElementById('mp_img').src = e.target.result;
                reader.readAsDataURL(file);
            }
        });
    }

    // Init Calendar
    if(typeof renderCalendar === "function") renderCalendar();

    // Init Chart (Flat/Zero)
    const ctx = document.getElementById('financeChart');
    if(ctx) {
        if (window.myFinanceChart) window.myFinanceChart.destroy();
        window.myFinanceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Week 01', 'Week 02', 'Week 03', 'Week 04'],
                datasets: [
                    { label: 'Income', data: [0, 0, 0, 0], backgroundColor: '#852221', borderRadius: 4, barPercentage: 0.6 },
                    { label: 'Outcome', data: [0, 0, 0, 0], backgroundColor: '#e2e8f0', borderRadius: 4, barPercentage: 0.6 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top', align: 'start', labels: { usePointStyle: true } } },
                scales: { y: { beginAtZero: true, max: 10000, grid: { borderDash: [5, 5] } }, x: { grid: { display: false } } }
            }
        });
    }
});
