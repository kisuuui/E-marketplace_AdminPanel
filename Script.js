// ==========================================
// 1. CONFIGURATION & INITIALIZATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyC75Zmb17vj7K3HeQKiHxbKvAzGIQmqQw4",
    authDomain: "e-campus-marketplace.firebaseapp.com",
    projectId: "e-campus-marketplace",
    storageBucket: "e-campus-marketplace.firebasestorage.app",
    messagingSenderId: "920245597144",
    appId: "1:920245597144:web:b2d1b5a74d562968f478ad",
    measurementId: "G-0L7G265Q5F"
};

const ALLOWED_ADMINS = ["admin@scc.com", "justinvenedict.scc@gmail.com"];
const PROFIT_PERCENTAGE = 0.12;

let auth, db; 
let globalUsers = [], globalProducts = [], globalTickets = [];
let currentTab = 'customers';
let editingProductId = null;
let currentCalendarDate = new Date(); 
let selectedFullDate = new Date();
let currentLogTab = 'Activity';

try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    console.log("Firebase Active");
} catch (e) { console.error("Init Error:", e); }


// ==========================================
// 2. AUTHENTICATION & PROFILE
// ==========================================
window.handleLogin = function() {
    const e = document.getElementById('loginEmail').value.trim();
    const p = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    const errorMsg = document.getElementById('loginError');

    if (btn) btn.textContent = "Verifying...";
    if (errorMsg) errorMsg.classList.add('hidden');

    auth.signInWithEmailAndPassword(e, p)
    .then(async (userCredential) => {
        // SUCCESSFUL LOGIN LOG
        // We log this in Section 2's onAuthStateChanged/fetchProfile, 
        // so we don't need to add it here.
    })
    .catch((err) => { // Removed 'async' from here
        if (btn) btn.textContent = "Sign In";
        if (errorMsg) {
            errorMsg.innerHTML = `<i data-lucide="alert-circle" class="w-4 h-4"></i> <span>${err.message}</span>`;
            errorMsg.classList.remove('hidden');
            if (window.lucide) lucide.createIcons();
        }

        // LOG THE FAILED ATTEMPT
        db.collection('logs').add({
            adminEmail: e,
            action: "Login Failed",
            details: `Error: ${err.code}`,
            level: "System",
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            console.log("Failed login recorded in System Logs.");
        }).catch(logErr => {
            console.warn("Log failed: check Firebase Rules.", logErr);
        });
    });
};

window.handleLogout = function() { auth.signOut().then(() => window.location.reload()); };

auth.onAuthStateChanged(async (user) => {
    const login = document.getElementById('login-screen');
    const dash = document.getElementById('dashboard-container');
    const sidebar = document.getElementById('sidebar');

    if (user) {
        if (ALLOWED_ADMINS.some(admin => admin.toLowerCase() === user.email.toLowerCase())) {
            if (login) login.style.display = 'none';
            if (dash) { dash.classList.remove('hidden'); dash.classList.add('flex'); }
            if (sidebar) sidebar.classList.remove('hidden'); 
            initDataListeners(); await fetchAndSyncUserProfile(user);
        } else { alert("Access Denied."); auth.signOut(); }
    } else {
        if (login) login.style.display = 'flex';
        if (dash) { dash.classList.add('hidden'); dash.classList.remove('flex'); }
        if (sidebar) sidebar.classList.add('hidden');
    }
});

async function fetchAndSyncUserProfile(user) {
    const userRef = db.collection('admin').doc(user.uid);
    try {
        const doc = await userRef.get();
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        
        let profileData;

        if (doc.exists) {
            profileData = doc.data();
            updateProfileUI(profileData.name || "Admin", profileData.role || "Admin", user.email, profileData.photoURL);
            
            if (profileData.role === 'Super Admin') {
                const logBtn = document.getElementById('nav-logs');
                if (logBtn) logBtn.classList.remove('hidden');
            }
            await userRef.update({ lastLogin: timestamp });
        } else {
            profileData = { name: "Admin User", email: user.email, role: "Admin", createdAt: timestamp, lastLogin: timestamp };
            await userRef.set(profileData);
            updateProfileUI(profileData.name, profileData.role, user.email);
        }

        // --- NEW DYNAMIC GREETING LOGIC (The "Team" addition) ---
        // 1. Get first name
        const firstName = profileData.name.split(' ')[0];
        document.querySelectorAll('.user-first-name').forEach(el => el.innerText = firstName);

        // 2. Time-aware greeting
        const hour = new Date().getHours();
        let welcome;
        if (hour < 12) welcome = "Good morning";
        else if (hour < 18) welcome = "Good afternoon";
        else welcome = "Good evening";

        const greetingEl = document.getElementById('greeting-text');
        if (greetingEl) greetingEl.innerText = welcome;
        // -------------------------------------------------------

    } catch (e) { 
        console.error("Profile Error", e); 
    }
}

function updateProfileUI(name, role, email, photoURL) {
    document.querySelectorAll('.user-name').forEach(el => el.innerText = name);
    document.querySelectorAll('.user-role').forEach(el => el.innerText = role);
    const imgUrl = photoURL || `https://ui-avatars.com/api/?name=${name}&background=852221&color=fff`;
    ['mp_img', 'sidebar-avatar', 'header-avatar', 'dropdown-avatar'].forEach(id => {
        const el = document.getElementById(id); if(el) el.src = imgUrl;
    });
}




// ==========================================
// 3. MASTER DATA LISTENERS 
// ==========================================
function initDataListeners() {
    triggerSkeleton('finance-orders-table', 4, 5);
    triggerSkeleton('tbody-all-items', 8, 7);
    triggerSkeleton('tbody-customers', 5, 5);
    triggerSkeleton('activity-list', 3, 1);

    // Products
    db.collection('products').orderBy('createdAt', 'desc').onSnapshot(snap => {
        globalProducts = [];
        snap.forEach(d => globalProducts.push({ id: d.id, ...d.data() }));
        renderProducts();
        renderSchoolListings();
        renderPendingApprovals();
        updateDashboardStats(); 
    });

    // Users
    db.collection('users').orderBy('createdAt', 'desc').onSnapshot(snap => {
        globalUsers = [];
        snap.forEach(d => globalUsers.push({ id: d.id, ...d.data() }));
        renderUsers(); updateDashboardStats(); 
    });

    // Financials & Logs
    db.collection('financials').onSnapshot(() => updateDashboardStats());
    renderDashboardActivity();
    
    // Support Tickets
    db.collection('tickets').orderBy('createdAt', 'desc').onSnapshot(snap => {
        globalTickets = [];
        snap.forEach(d => globalTickets.push({ id: d.id, ...d.data() }));
        const inboxView = document.getElementById('view-inbox');
        if (inboxView && !inboxView.classList.contains('hidden')) renderInbox();
    });

    // Notification Bell (Unverified Users)
    db.collection('users').where('verified', '==', false).onSnapshot(snap => {
        const bellDot = document.querySelector('.absolute.top-2.right-2.bg-red-500');
        if (bellDot) snap.size > 0 ? bellDot.classList.remove('hidden') : bellDot.classList.add('hidden');
    });

    db.collection('users').onSnapshot(snap => {
    globalUsers = [];
    snap.forEach(doc => {
        // We spread the data and add the ID as both 'id' and 'uid' 
        // to make sure your .find() logic never fails
        globalUsers.push({ id: doc.id, uid: doc.id, ...doc.data() });
    });
    renderUsers(); // Refresh the table whenever a promotion happens!
});
}


// ==========================================
// 4. SMART DASHBOARD (Audit Mode Logic)
// ==========================================
function updateDashboardStats() {
    const revenueCard = document.getElementById('dash-total-revenue');
    const finRevenueCard = document.getElementById('fin-total-revenue');
    const salesCard = document.getElementById('dash-total-overall-sales');
    const orderCountCard = document.getElementById('dash-total-orders');
    const tableBody = document.getElementById('finance-orders-table');

    if (revenueCard) triggerSkeleton('dash-total-revenue', 1);
    if (salesCard) triggerSkeleton('dash-total-overall-sales', 1);

    db.collection('financials').orderBy('date', 'desc').get().then(snap => {
        let lifetimeNet = 0, lifetimeGross = 0, lifetimeCount = 0;
        let filteredNet = 0, filteredGross = 0, filteredCount = 0;
        let weeklyBuckets = [0, 0, 0, 0]; let allTransactions = []; 
        const now = new Date();
        const isToday = selectedFullDate.getDate() === now.getDate() && selectedFullDate.getMonth() === now.getMonth() && selectedFullDate.getFullYear() === now.getFullYear();

        if (snap.empty) {
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400 italic">No transactions found.</td></tr>`;
            if (revenueCard) revenueCard.innerText = "₱0.00"; if (salesCard) salesCard.innerText = "₱0.00";
            return;
        }

        snap.forEach(doc => {
            const d = doc.data();
            if(d.type === 'Income' && d.date) {
                const amount = parseFloat(d.amount) || 0;
                const adminProfit = amount * PROFIT_PERCENTAGE; 
                const docDate = d.date.toDate();
                
                lifetimeGross += amount; lifetimeNet += adminProfit; lifetimeCount++;
                allTransactions.push({ id: doc.id, ...d });

                const isMatch = docDate.getDate() === selectedFullDate.getDate() && docDate.getMonth() === selectedFullDate.getMonth() && docDate.getFullYear() === selectedFullDate.getFullYear();
                if (isMatch) { filteredGross += amount; filteredNet += adminProfit; filteredCount++; }

                if (docDate.getMonth() === now.getMonth() && docDate.getFullYear() === now.getFullYear()) {
                    let weekIdx = docDate.getDate() <= 7 ? 0 : docDate.getDate() <= 14 ? 1 : docDate.getDate() <= 21 ? 2 : 3;
                    weeklyBuckets[weekIdx] += adminProfit;
                }
            }
        });

        const displayNet = isToday ? lifetimeNet : filteredNet;
        const displayGross = isToday ? lifetimeGross : filteredGross;
        const displayCount = isToday ? lifetimeCount : filteredCount;

        if(revenueCard) revenueCard.innerText = "₱" + displayNet.toLocaleString(undefined, {minimumFractionDigits: 2});
        if(finRevenueCard) finRevenueCard.innerText = "₱" + displayNet.toLocaleString(undefined, {minimumFractionDigits: 2});
        if(salesCard) salesCard.innerText = "₱" + displayGross.toLocaleString(undefined, {minimumFractionDigits: 2});
        if(orderCountCard) orderCountCard.innerText = displayCount;

        const subText = document.querySelector('#dash-total-overall-sales + span');
        if (subText) {
            subText.innerText = isToday ? "Lifetime Gross amount" : `Gross amount for ${selectedFullDate.toLocaleDateString('en-GB')}`;
            subText.className = isToday ? "text-xs text-gray-400 font-medium" : "text-xs text-[#852221] dark:text-red-400 font-bold";
        }

        if (document.getElementById('dash-active-products')) document.getElementById('dash-active-products').innerText = globalProducts.filter(p => (p.Status || '').toLowerCase() === 'in stock').length;
        if (document.getElementById('dash-total-users')) document.getElementById('dash-total-users').innerText = globalUsers.length;

        if (tableBody) {
            let dData = isToday ? allTransactions.slice(0, 4) : allTransactions.filter(order => {
                if (!order.date) return false; const dDate = order.date.toDate();
                return dDate.getDate() === selectedFullDate.getDate() && dDate.getMonth() === selectedFullDate.getMonth() && dDate.getFullYear() === selectedFullDate.getFullYear();
            });

            if (dData.length === 0) tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400 italic">No transactions recorded for ${selectedFullDate.toLocaleDateString('en-GB')}.</td></tr>`;
            else tableBody.innerHTML = dData.slice(0, 10).map(o => `<tr class="border-b border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-gray-800"><td class="py-4 font-medium text-gray-800 dark:text-gray-200">${o.buyerName || 'Walk-in'}</td><td class="py-4 text-gray-600 dark:text-gray-400">${o.itemName || 'Item'}</td><td class="py-4 text-gray-600 dark:text-gray-400">${o.date.toDate().toLocaleDateString('en-GB')}</td><td class="py-4 text-right font-medium text-gray-800 dark:text-gray-200">₱${parseFloat(o.amount).toLocaleString()}</td><td class="py-4 text-right"><span class="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-600">Completed</span></td></tr>`).join('');
        }

        if (window.myFinanceChart) { window.myFinanceChart.data.datasets[0].data = weeklyBuckets; window.myFinanceChart.update(); }
    });
}


// ==========================================
// 5. RENDER ENGINE (Products, Users, Logs, Ledger)
// ==========================================
function renderProducts() {
    const tDashboard = document.querySelector('#productsTable tbody');
    const tAllItems = document.getElementById('tbody-all-items');
    
    if (tDashboard) tDashboard.innerHTML = ''; 
    if (tAllItems) tAllItems.innerHTML = '';

    globalProducts.forEach(p => {
        const name = p.Product || p.name || 'Unnamed'; 
        const img = p.Image || `https://ui-avatars.com/api/?name=${name}&background=eee`;
        const price = p.Price || 0; 
        const stock = p.Stock || 0; 
        const status = p.Status || 'Unknown';

        // --- 1. PREMIUM DASHBOARD VIEW (Inventory Monitor) ---
        if (tDashboard && globalProducts.indexOf(p) < 5) {
            const stockPercent = Math.min((stock / 100) * 100, 100);
            const barColor = stock < 10 ? 'bg-red-500' : 'bg-green-500';

            tDashboard.innerHTML += `
            <tr onclick="viewProductDetails('${p.id}')" class="group hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-pointer">
                <td class="px-8 py-5 flex items-center gap-4">
                    <img src="${img}" class="w-12 h-12 rounded-2xl object-cover grayscale group-hover:grayscale-0 transition-all duration-500 shadow-sm border border-gray-100 dark:border-dark-border">
                    <div>
                        <p class="font-bold text-slate-700 dark:text-white leading-none mb-1">${name}</p>
                        <p class="text-[10px] text-slate-400 font-mono uppercase">ID: ${p.id.substring(0,6)}</p>
                    </div>
                </td>
                <td class="px-8 py-5">
                    <div class="flex items-center gap-3">
                        <div class="flex-1 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full w-24 overflow-hidden">
                            <div class="h-full ${barColor} transition-all duration-1000" style="width: ${stockPercent}%"></div>
                        </div>
                        <span class="text-xs font-bold text-slate-500">${stock}</span>
                    </div>
                </td>
                <td class="px-8 py-5 text-right">
                    <span class="${getStatusBadge(status)} badge-premium uppercase tracking-tighter shadow-sm">${status}</span>
                </td>
            </tr>`;
        }

        // --- 2. ALL ITEMS VIEW (Full Inventory Table) ---
        if (tAllItems) {
            tAllItems.innerHTML += `
            <tr class="table-row-hover group border-b border-gray-50 dark:border-dark-border transition-colors text-sm cursor-pointer">
                <td onclick="viewProductDetails('${p.id}')" class="px-6 py-4 flex items-center gap-3">
                    <img src="${img}" class="w-10 h-10 rounded-lg object-cover shadow-sm">
                    <div>
                        <p class="font-bold text-gray-700 dark:text-gray-300">${name}</p>
                        <p class="text-xs text-gray-400 font-mono">${p.id.substring(0,6).toUpperCase()}</p>
                    </div>
                </td>
                <td onclick="viewProductDetails('${p.id}')" class="px-6 py-4 text-gray-600 dark:text-gray-400">${p.Category || '--'}</td>
                <td onclick="viewProductDetails('${p.id}')" class="px-6 py-4 text-gray-600 dark:text-gray-400">${p.Recipient || '--'}</td>
                <td onclick="viewProductDetails('${p.id}')" class="px-6 py-4 font-bold text-gray-700 dark:text-gray-300">₱${price.toLocaleString()}</td>
                <td onclick="viewProductDetails('${p.id}')" class="px-6 py-4 text-gray-600 dark:text-gray-400 font-mono">${stock}</td>
                <td onclick="viewProductDetails('${p.id}')" class="px-6 py-4 text-right">
                    <span class="${getStatusBadge(status)}">${status}</span>
                </td>
                <td class="px-6 py-4 text-right flex justify-end gap-2">
                    <button onclick="event.stopPropagation(); editProduct('${p.id}')" class="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1.5 rounded transition-all">
                        <i data-lucide="edit-3" class="w-4 h-4"></i>
                    </button>
                    <button onclick="event.stopPropagation(); deleteItem('products', '${p.id}')" class="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-all">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </td>
            </tr>`;
        }
    });

    if(window.lucide) lucide.createIcons();
}

function renderSchoolListings() {
    const tbody = document.getElementById('tbody-school-listings');
    const filter = document.getElementById('deptFilter');
    if (!tbody) return;

    const officialDepts = ["Library", "Virtual Lab", "Computer Lab", "Supply Department"];
    const selected = filter ? filter.value : "All";

    let data = globalProducts.filter(p => officialDepts.some(d => d.toLowerCase() === (p.Recipient || '').trim().toLowerCase()));
    if (selected !== "All") data = data.filter(p => (p.Recipient || '').trim().toLowerCase() === selected.toLowerCase());

    tbody.innerHTML = '';
    if (data.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-gray-400 italic">No official items currently allocated.</td></tr>`; return; }

    data.sort((a, b) => (a.Recipient || '').localeCompare(b.Recipient || '')).forEach(p => {
        let badge = 'bg-gray-100 text-gray-600'; const dLower = (p.Recipient || '').toLowerCase();
        if(dLower === 'library') badge = 'bg-blue-50 text-blue-600';
        if(dLower === 'virtual lab') badge = 'bg-purple-50 text-purple-600';
        if(dLower === 'computer lab') badge = 'bg-indigo-50 text-indigo-600';
        if(dLower === 'supply department') badge = 'bg-amber-50 text-amber-600';

        tbody.innerHTML += `<tr class="hover:bg-gray-50 dark:hover:bg-dark-border transition-colors"><td class="px-6 py-4"><span class="px-3 py-1 rounded-full text-xs font-bold ${badge}">${p.Recipient || '--'}</span></td><td class="px-6 py-4 font-bold flex items-center gap-3"><img src="${p.Image || `https://ui-avatars.com/api/?name=${p.Product || 'Item'}&background=eee`}" class="w-8 h-8 rounded object-cover shadow-sm">${p.Product || 'Unnamed Item'}</td><td class="px-6 py-4 text-gray-600">${p.Category || '--'}</td><td class="px-6 py-4 text-right font-mono text-gray-600">${p.Stock || 0}</td><td class="px-6 py-4 text-right"><span class="${getStatusBadge(p.Status || 'Unknown')}">${p.Status || 'Unknown'}</span></td></tr>`;
    });
}

function renderPendingApprovals() {
    const tbody = document.getElementById('tbody-pending-approvals');
    if (!tbody) return;

    const pItems = globalProducts.filter(p => (p.Status || '').toLowerCase() === 'pending');
    tbody.innerHTML = '';

    if (pItems.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-gray-400 italic"><i data-lucide="check-circle" class="w-8 h-8 mx-auto mb-2 opacity-50 text-green-500"></i> No pending items to review.</td></tr>`; if(window.lucide) lucide.createIcons(); return; }

    pItems.forEach(p => {
        const name = p.Product || p.name || 'Unnamed Item';
        tbody.innerHTML += `<tr class="hover:bg-gray-50 dark:hover:bg-dark-border transition-colors"><td class="px-6 py-4 flex items-center gap-3"><img src="${p.Image || `https://ui-avatars.com/api/?name=${name}&background=eee`}" class="w-10 h-10 rounded-lg object-cover shadow-sm"><div><p class="font-bold text-gray-700">${name}</p><p class="text-xs text-orange-500 font-bold flex items-center gap-1 mt-0.5"><span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Needs Review</p></div></td><td class="px-6 py-4 text-gray-600 font-medium">${p.Recipient || 'Mobile User'}</td><td class="px-6 py-4"><span class="px-2 py-1 bg-gray-100 rounded text-xs text-gray-500">${p.Category || '--'}</span></td><td class="px-6 py-4 font-bold text-gray-700 text-right">₱${p.Price || 0}</td><td class="px-6 py-4 text-center"><div class="flex justify-center gap-2"><button onclick="approveProduct('${p.id}', '${name}')" class="px-3 py-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg text-xs font-bold border border-green-200">Approve</button><button onclick="rejectProduct('${p.id}', '${name}')" class="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold border border-red-200">Reject</button></div></td></tr>`;
    });
    if(window.lucide) lucide.createIcons();
}

function renderUsers() {
    const tCus = document.getElementById('tbody-customers'); 
    const tSel = document.getElementById('tbody-sellers'); 
    const tUnv = document.getElementById('tbody-unverified');
    
    if(tCus) tCus.innerHTML = ''; 
    if(tSel) tSel.innerHTML = ''; 
    if(tUnv) tUnv.innerHTML = '';

    // --- TEAM DEBUG: Let's see what the role is ---
    const roleElement = document.querySelector('.user-role');
    const loggedInRole = roleElement ? roleElement.innerText.trim().toUpperCase() : "";
    console.log("Current Logged-in Role (Hardened):", loggedInRole);

    globalUsers.forEach(u => {
        const name = u.name || 'Unknown'; 
        const isVerified = u.verified === true || u.status === 'Active'; 
        const userId = u.id || u.uid; 
        const currentType = (u.userType || u.type || 'Customer').toUpperCase();
        const currentRole = (u.role || 'User').toUpperCase();

        // 1. Logic for Promotion Button
        let promoBtn = "";
        
        // CHECK 1: Are you a Super Admin? Is the user Staff? Are they not yet an Admin?
        if (loggedInRole === "SUPER ADMIN") {
            if (currentType === "STAFF" && currentRole !== "ADMIN") {
                promoBtn = `<button onclick="promoteUser('${userId}')" class="text-[10px] bg-red-50 text-red-600 px-2 py-1 rounded border border-red-100 hover:bg-red-600 hover:text-white transition-all mr-2 font-black uppercase tracking-tighter">Promote to Admin</button>`;
            }
        } 
        // CHECK 2: Are you a standard Admin? Is the user a Customer?
        else if (loggedInRole === "ADMIN") {
            if (currentType === "CUSTOMER" && isVerified) {
                promoBtn = `<button onclick="promoteUser('${userId}')" class="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100 hover:bg-blue-600 hover:text-white transition-all mr-2 font-black uppercase tracking-tighter">Make Staff</button>`;
            }
        }

    // 2. The Complete Row Template
    const row = `
    <tr class="border-b border-gray-50 dark:border-dark-border table-row-hover transition-colors">
        <td class="px-6 py-4 flex items-center gap-3">
            <img src="https://ui-avatars.com/api/?name=${name}&background=random&color=fff" class="w-8 h-8 rounded-full shadow-sm">
            <div>
                <p class="font-bold text-sm text-gray-700 dark:text-gray-300 leading-none mb-1">${name}</p>
                <p class="text-[10px] text-gray-400 font-mono">${u.email || ''}</p>
            </div>
        </td>
        <td class="px-6 py-4 text-gray-600 dark:text-gray-400 font-medium">${currentType}</td>
        <td class="px-6 py-4">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                ${u.role || 'User'}
            </span>
        </td>
        <td class="px-6 py-4">
            ${isVerified 
                ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-600 uppercase tracking-tighter">Verified</span>' 
                : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-500 uppercase tracking-tighter">Unverified</span>'}
        </td>
        <td class="px-6 py-4 text-right">
            <div class="flex items-center justify-end">
                ${!isVerified ? `<button onclick="openVerifyModal('${userId}', '${u.email}')" class="text-blue-600 hover:text-blue-800 text-xs font-bold mr-3">Verify</button>` : ''}
                
                ${promoBtn}

                <button onclick="deleteItem('users', '${userId}')" class="text-red-400 hover:text-red-600 p-1.5 transition-colors">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        </td>
    </tr>`;

    // 3. Sorting into Tabs (Simplified Logic)
    if (!isVerified) { 
        if(tUnv) tUnv.innerHTML += row; 
    } else if (currentType === 'Seller' || currentType === 'Staff') { 
        if(tSel) tSel.innerHTML += row; 
    } else { 
        if(tCus) tCus.innerHTML += row; 
    }
});

}

function renderTransactions() {
    const tbody = document.getElementById('tbody-transactions');
    if (!tbody) return;

    db.collection('financials').orderBy('date', 'desc').limit(50).get().then(snap => {
        tbody.innerHTML = ''; 
        if (snap.empty) { tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-8 text-center text-gray-400 italic">No transactions found.</td></tr>'; return; }

        let html = ''; let tGross = 0; let tNet = 0;

        snap.forEach(doc => {
            const d = doc.data(); const amt = parseFloat(d.amount) || 0; const prof = amt * PROFIT_PERCENTAGE; 
            tGross += amt; tNet += prof;

            html += `<tr class="hover:bg-gray-50 dark:hover:bg-dark-border transition-colors text-sm"><td class="px-6 py-4 text-gray-500 font-mono">${d.date ? d.date.toDate().toLocaleDateString() : 'N/A'}</td><td class="px-6 py-4 font-medium text-gray-800 dark:text-white">${d.buyerName || 'Walk-in'}</td><td class="px-6 py-4 text-gray-600 dark:text-gray-300">${d.itemName || '--'}</td><td class="px-6 py-4"><span class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-500">${d.category || 'General'}</span></td><td class="px-6 py-4 text-right"><div class="font-bold text-green-600">+₱${amt.toLocaleString()}</div><div class="text-[10px] text-gray-400">Profit: ₱${prof.toFixed(2)}</div></td><td class="px-6 py-4 text-gray-500 text-xs truncate max-w-[150px]">${d.description || ''}</td><td class="px-6 py-4 text-gray-600 text-xs">${d.recipient || 'Admin'}</td><td class="px-6 py-4 text-right text-xs font-mono text-gray-400">#${d.refId || doc.id.substring(0,8).toUpperCase()}</td></tr>`;
        });
        tbody.innerHTML = html;
        
        const tDisp = document.getElementById('total-income-display'); const pDisp = document.getElementById('trans-total-profit'); const rDisp = document.getElementById('trans-total-remittance');
        if(tDisp) tDisp.innerText = "₱" + tGross.toLocaleString(undefined, {minimumFractionDigits: 2});
        if(pDisp) pDisp.innerText = "₱" + tNet.toLocaleString(undefined, {minimumFractionDigits: 2});
        if(rDisp) rDisp.innerText = "₱" + (tGross - tNet).toLocaleString(undefined, {minimumFractionDigits: 2});
    }).catch(e => { tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-8 text-center text-red-400">Error loading data.</td></tr>'; });
}



function renderDashboardActivity() {
    const actList = document.getElementById('activity-list'); if (!actList) return;
    db.collection('logs').orderBy('timestamp', 'desc').limit(5).onSnapshot(snap => {
        if (snap.empty) { actList.innerHTML = `<div class="text-xs text-gray-400 p-4">No recent activity.</div>`; return; }
        let html = '<div class="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-100 dark:bg-dark-border z-0"></div>';
        snap.forEach(doc => {
            const d = doc.data();
            html += `<div class="flex gap-4 relative z-10 mb-6"><div class="w-8 h-8 rounded-full bg-red-50 text-primary flex items-center justify-center flex-shrink-0 border-2 border-white dark:border-dark-card shadow-sm"><i data-lucide="activity" class="w-4 h-4"></i></div><div><h4 class="text-sm font-bold">${d.action}</h4><p class="text-xs text-gray-400 mt-0.5">${d.adminName} • ${d.timestamp ? d.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}</p></div></div>`;
        });
        actList.innerHTML = html; if(window.lucide) lucide.createIcons();
    });
}

function getStatusBadge(status) {
    const s = (status || '').toLowerCase(); const base = "px-2 py-1 rounded text-xs font-bold";
    if (['in stock', 'active', 'verified'].includes(s)) return `${base} bg-green-100 text-green-600`;
    if (['out of stock', 'rejected', 'suspended'].includes(s)) return `${base} bg-red-100 text-red-600`;
    if (['low stock', 'pending'].includes(s)) return `${base} bg-orange-100 text-orange-600`;
    return `${base} bg-gray-100 text-gray-500`;
}


// ==========================================
// 6. SUPPORT TICKETING ENGINE
// ==========================================
function renderInbox() {
    const listContainer = document.getElementById('inbox-list');
    if (!listContainer) return;

    if (globalTickets.length === 0) {
        listContainer.innerHTML = `<div class="p-8 text-center text-gray-400 flex flex-col items-center"><i data-lucide="check-circle" class="w-8 h-8 mb-2 opacity-30 text-green-500"></i><span class="text-sm">Inbox is empty.</span></div>`;
        if(window.lucide) lucide.createIcons();
        return;
    }

    let html = '';
    globalTickets.forEach(t => {
        const isResolved = t.status === 'Resolved';
        const badgeColor = isResolved ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600';
        const icon = isResolved ? 'check-circle' : 'alert-circle';
        const dateStr = t.createdAt && t.createdAt.toDate ? t.createdAt.toDate().toLocaleDateString('en-GB') : 'Just now';

        html += `
        <div onclick="viewTicket('${t.id}')" class="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border transition-colors border-b border-gray-50 dark:border-dark-border group">
            <div class="flex justify-between items-start mb-1">
                <h4 class="text-sm font-bold text-gray-800 dark:text-gray-200 group-hover:text-[#852221] transition-colors truncate pr-2">${t.subject || 'Support Request'}</h4>
                <span class="text-[10px] text-gray-400 whitespace-nowrap">${dateStr}</span>
            </div>
            <p class="text-xs text-gray-500 truncate mb-2">${t.message || '...'}</p>
            <div class="flex justify-between items-center">
                <span class="text-xs font-medium text-gray-600 dark:text-gray-400">${t.senderName || 'User'}</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${badgeColor}"><i data-lucide="${icon}" class="w-3 h-3"></i> ${t.status || 'Open'}</span>
            </div>
        </div>`;
    });
    
    listContainer.innerHTML = html;
    if(window.lucide) lucide.createIcons();
}

window.viewTicket = function(id) {
    const t = globalTickets.find(x => x.id === id);
    if (!t) return;

    document.getElementById('active-ticket-id').value = id;
    document.getElementById('ticket-detail-id').innerText = `#TCK-${id.substring(0,6).toUpperCase()}`;
    document.getElementById('ticket-detail-subject').innerText = t.subject || 'Support Request';
    document.getElementById('ticket-detail-sender').innerText = t.senderName || 'Unknown User';
    
    const dateStr = t.createdAt && t.createdAt.toDate ? t.createdAt.toDate().toLocaleString() : 'Just now';
    document.getElementById('ticket-detail-date').innerText = dateStr;

    const statusBadge = document.getElementById('ticket-detail-status');
    statusBadge.innerText = t.status || 'Open';
    statusBadge.className = t.status === 'Resolved' ? 'px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-600' : 'px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-600';

    const conversationArea = document.getElementById('ticket-conversation');
    if (!conversationArea) return console.error("Missing ticket-conversation div!");

    let convoHtml = `
        <div class="flex flex-col gap-1 mb-6">
            <span class="text-xs text-gray-400 ml-2 font-medium">${t.senderName || 'User'}</span>
            <div class="bg-white dark:bg-dark-card p-5 rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 dark:border-dark-border inline-block max-w-[85%] self-start">
                <p class="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">${t.message || '...'}</p>
            </div>
        </div>
    `;

    if (t.adminReply) {
        convoHtml += `
        <div class="flex flex-col gap-1 mb-6 items-end">
            <span class="text-xs text-gray-400 mr-2 font-medium">Admin (You)</span>
            <div class="bg-[#852221] p-5 rounded-2xl rounded-tr-sm shadow-sm text-white inline-block max-w-[85%] self-end">
                <p class="text-sm whitespace-pre-wrap leading-relaxed">${t.adminReply}</p>
            </div>
        </div>
        `;
    }

    conversationArea.innerHTML = convoHtml;

    document.getElementById('inbox-empty-state').classList.add('hidden');
    document.getElementById('inbox-active-ticket').classList.remove('hidden');
    
    setTimeout(() => { conversationArea.scrollTop = conversationArea.scrollHeight; }, 50);
};

window.closeTicketView = function() {
    document.getElementById('inbox-active-ticket').classList.add('hidden');
    document.getElementById('inbox-empty-state').classList.remove('hidden');
};

window.replyToTicket = async function() {
    const id = document.getElementById('active-ticket-id').value;
    const replyText = document.getElementById('ticket-reply-text').value.trim();
    
    if(!id) return;
    if(!replyText) return alert("Please type a reply first before sending.");

    const conversationArea = document.getElementById('ticket-conversation');
    if (conversationArea) {
        conversationArea.innerHTML += `
        <div class="flex flex-col gap-1 mb-6 items-end">
            <span class="text-xs text-gray-400 mr-2 font-medium">Admin (You)</span>
            <div class="bg-[#852221] p-5 rounded-2xl rounded-tr-sm shadow-sm text-white inline-block max-w-[85%] self-end">
                <p class="text-sm whitespace-pre-wrap leading-relaxed">${replyText}</p>
            </div>
        </div>
        `;
        setTimeout(() => { conversationArea.scrollTop = conversationArea.scrollHeight; }, 10);
    }

    const statusBadge = document.getElementById('ticket-detail-status');
    if (statusBadge) {
        statusBadge.innerText = 'Resolved';
        statusBadge.className = 'px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-600';
    }

    document.getElementById('ticket-reply-text').value = '';

    const ticketIndex = globalTickets.findIndex(x => x.id === id);
    if (ticketIndex > -1) {
        globalTickets[ticketIndex].adminReply = replyText;
        globalTickets[ticketIndex].status = 'Resolved';
    }

    try {
        await db.collection('tickets').doc(id).update({ 
            adminReply: replyText,
            status: 'Resolved',
            repliedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await logAction("Replied to Ticket", `Ticket ID: ${id.substring(0,6)}`);
    } catch(e) { 
        console.error("Database Error:", e);
        alert("Warning: Visuals updated, but failed to save to database. " + e.message); 
    }
};

window.resolveTicket = async function() {
    const id = document.getElementById('active-ticket-id').value;
    if(!id) return;
    
    try {
        await db.collection('tickets').doc(id).update({ status: 'Resolved' });
        await logAction("Resolved Ticket", `Ticket ID: ${id.substring(0,6)}`);
        
        const statusBadge = document.getElementById('ticket-detail-status');
        if (statusBadge) {
            statusBadge.innerText = 'Resolved';
            statusBadge.className = 'px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-600';
        }
    } catch(e) { alert("Error: " + e.message); }
};

window.createDemoTicket = async function() {
    const btn = document.querySelector('button[onclick="createDemoTicket()"]');
    if(btn) { btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Generating...`; btn.disabled = true; }

    try {
        await db.collection('tickets').add({
            subject: "Cannot process payment for Uniform",
            message: "Hello Admin, I am trying to checkout my PE Uniform but the GCash QR code is not loading. Can you help me check if the system is down? My student ID is 2024-1234.",
            senderName: "Mark Bautista",
            senderEmail: "mark.b@student.scc.edu.ph",
            status: "Open",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) { 
        console.error(e); alert("Error generating ticket: " + e.message);
    } finally {
        if(btn) { btn.innerHTML = `<i data-lucide="plus-circle" class="w-4 h-4"></i> Generate Demo Ticket`; btn.disabled = false; }
        if(window.lucide) lucide.createIcons();
    }
};


// ==========================================
// 7. CRUD OPERATIONS (Save, Edit, Approvals)
// ==========================================
window.saveNewProduct = async function() {
    const name = document.getElementById('inp_name').value; 
    const price = document.getElementById('inp_price').value;
    const stock = document.getElementById('inp_stock').value;
    const file = document.getElementById('inp_file').files[0];
    
    if (!name || !price) return alert("Please fill in the Product Name and Price");

    const btn = document.querySelector('#addItemModal button[onclick="saveNewProduct()"]');
    if (btn) { btn.textContent = "Uploading..."; btn.disabled = true; }

    try {
        let imageUrl = file ? await uploadToCloudinary(file) : `https://ui-avatars.com/api/?name=${name}&background=eee`;

        const productData = {
            Product: name, Price: Number(price), Stock: Number(stock) || 0,
            Category: document.getElementById('inp_category').value || 'General', 
            Status: document.getElementById('inp_status').value || 'In Stock',
            Recipient: document.getElementById('inp_recipient').value || '', 
            Description: document.getElementById('inp_desc').value || '',
            Image: imageUrl, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('products').add(productData);
        await logAction("Created Product", `Item: ${name} (ID: ${docRef.id.substring(0,6)})`);
        
        alert("Product Saved Successfully!");
        closeAndClearModal('addItemModal'); 
    } catch (e) { 
        console.error("Save Error:", e); alert("Error saving product: " + e.message); 
    } finally { if (btn) { btn.textContent = "Save Product"; btn.disabled = false; } }
};

window.editProduct = function(id) {
    const product = globalProducts.find(p => p.id === id); 
    if (!product) return;
    
    document.getElementById('edit_id').value = id;
    document.getElementById('edit_name').value = product.Product || '';
    document.getElementById('edit_price').value = product.Price || '';
    document.getElementById('edit_stock').value = product.Stock || '';
    document.getElementById('edit_category').value = product.Category || 'School Supplies';
    document.getElementById('edit_status').value = product.Status || 'In Stock';
    document.getElementById('edit_recipient').value = product.Recipient || '';
    document.getElementById('edit_desc').value = product.Description || '';

    const mediaArea = document.querySelector('#editItemModal .media-upload-area');
    if (mediaArea) {
        if (product.Image) mediaArea.innerHTML = `<img src="${product.Image}" class="w-full h-32 object-contain rounded-lg">`;
        else {
            mediaArea.innerHTML = `<i data-lucide="image" class="w-8 h-8 mx-auto text-gray-300 mb-2"></i><span class="text-xs text-gray-500">Click to Change Image</span>`;
            if(window.lucide) lucide.createIcons();
        }
    }
    openModal('editItemModal');
};

window.updateExistingProduct = async function() {
    const id = document.getElementById('edit_id').value;
    const name = document.getElementById('edit_name').value; 
    const price = document.getElementById('edit_price').value;
    const stock = document.getElementById('edit_stock').value;
    const file = document.getElementById('edit_file').files[0];
    
    if (!id || !name || !price) return alert("Missing required fields.");

    const btn = document.querySelector('#editItemModal button[onclick="updateExistingProduct()"]');
    if (btn) { btn.textContent = "Updating..."; btn.disabled = true; }

    try {
        const productData = {
            Product: name, Price: Number(price), Stock: Number(stock) || 0,
            Category: document.getElementById('edit_category').value || 'General', 
            Status: document.getElementById('edit_status').value || 'In Stock',
            Recipient: document.getElementById('edit_recipient').value || '', 
            Description: document.getElementById('edit_desc').value || ''
        };

        if (file) productData.Image = await uploadToCloudinary(file);

        await db.collection('products').doc(id).update(productData);
        await logAction("Updated Product", `Item: ${name} (ID: ${id.substring(0,6)})`);
        
        alert("Product Updated Successfully!");
        closeAndClearModal('editItemModal'); 
    } catch (e) { 
        console.error("Update Error:", e); alert("Error updating product: " + e.message); 
    } finally { if (btn) { btn.textContent = "Update Product"; btn.disabled = false; } }
};

window.approveProduct = async function(id, name) {
    if(confirm(`Approve "${name}" and publish it?`)) {
        try { await db.collection('products').doc(id).update({ Status: 'In Stock' }); await logAction("Approved Product", `Published item: ${name}`); } 
        catch (error) { alert("Error approving: " + error.message); }
    }
};

window.rejectProduct = async function(id, name) {
    if(confirm(`Reject and delete "${name}"? This cannot be undone.`)) {
        try { await db.collection('products').doc(id).delete(); await logAction("Rejected Product", `Deleted submission: ${name}`); } 
        catch (error) { alert("Error rejecting: " + error.message); }
    }
};

window.saveFinancialRecord = async function() {
    const amtVal = document.getElementById('fin_amount').value; const buyVal = document.getElementById('fin_buyer').value.trim(); const itmVal = document.getElementById('fin_item').value.trim();
    if (!amtVal || !buyVal || !itmVal) return alert("Please fill Amount, Buyer, and Item Name.");
    const btn = document.querySelector('#addFinanceModal button[onclick="saveFinancialRecord()"]'); btn.textContent = "Saving..."; btn.disabled = true;

    try {
        const dVal = document.getElementById('fin_date').value; const amt = parseFloat(amtVal);
        await db.collection('financials').add({
            type: "Income", date: dVal ? new Date(dVal) : new Date(), refId: document.getElementById('fin_refId').value.trim() || "AUTO-" + Date.now().toString().slice(-6),
            buyerName: buyVal, recipient: document.getElementById('fin_recipient').value.trim() || "General Fund", itemName: itmVal, category: document.getElementById('fin_category').value,
            amount: amt, description: document.getElementById('fin_desc').value.trim(), createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: auth.currentUser ? auth.currentUser.email : 'System'
        });
        await logAction("Recorded Income", `Sold: ${itmVal} to ${buyVal} for ₱${amt}`);
        alert("Transaction Saved!"); closeAndClearModal('addFinanceModal');
        if(typeof renderTransactions === 'function') renderTransactions();
    } catch (e) { alert("Error: " + e.message); } finally { btn.textContent = "Save Record"; btn.disabled = false; }
};

window.saveNewUser = async function() {
    const em = document.getElementById('u_email').value; const pa = document.getElementById('u_pass').value; const nm = document.getElementById('u_name').value;
    if (!nm || !em || !pa) return alert("Missing fields");
    const btn = document.querySelector('#addUserModal button.bg-primary'); btn.textContent = "Creating..."; btn.disabled = true;
    let secApp = null;
    try {
        secApp = firebase.initializeApp(firebaseConfig, "Secondary");
        const cred = await secApp.auth().createUserWithEmailAndPassword(em, pa);
        await db.collection('users').doc(cred.user.uid).set({
            name: nm, email: em, role: document.getElementById('u_role').value, userType: document.getElementById('u_type').value, course: document.getElementById('u_course').value,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(), status: 'Active', verified: true
        });
        await logAction("Created User", `Name: ${nm} (${em})`);
        await secApp.auth().signOut(); alert("User Created!"); closeAndClearModal('addUserModal');
    } catch (e) { alert("Error: " + e.message); } finally { if(secApp) secApp.delete(); btn.textContent = "Create User"; btn.disabled = false; }
};

window.saveVerifiedUser = async function() {
    const uid = document.getElementById('v_uid').value; const nm = document.getElementById('v_name').value;
    if(!nm) return alert("Please confirm the user's name");
    await db.collection('users').doc(uid).update({ name: nm, userType: document.getElementById('v_type').value, role: document.getElementById('v_role').value, verified: true, status: 'Active' });
    await logAction("Verified User", `User: ${nm} (ID: ${uid})`); closeModal('verifyUserModal'); alert("User Verified.");
};

window.saveMyProfile = async function() {
    const u = auth.currentUser; const nm = document.getElementById('mp_name').value; const file = document.getElementById('mp_file').files[0];
    const btn = document.querySelector('#myProfileModal button.bg-primary'); btn.textContent = "Updating..."; btn.disabled = true;
    try {
        let url = file ? await uploadToCloudinary(file) : null;
        await db.collection('admin').doc(u.uid).update({ name: nm, ...(url && {photoURL: url}) });
        await logAction("Updated Profile", `Admin: ${nm}`);
        updateProfileUI(nm, document.getElementById('mp_role').value, u.email, url || document.getElementById('mp_img').src);
        closeModal('myProfileModal'); alert("Profile Updated!");
    } catch(e) { alert(e.message); } finally { btn.textContent = "Update Profile"; btn.disabled = false; }
};

window.deleteItem = async function(collection, id) {
    if(confirm("Are you sure you want to delete this record?")) {
        try { 
            await db.collection(collection).doc(id).delete(); 
            // Add "Audit" here:
            await logAction("Deleted Item", `Collection: ${collection}, ID: ${id}`, "Audit"); 
        } 
        catch (error) { alert("Error deleting: " + error.message); }
    }
};

async function logAction(actionTitle, actionDetails, logLevel = 'Activity') {
    const user = auth.currentUser; 
    if (!user) return;

    try {
        await db.collection('logs').add({
            adminId: user.uid,
            adminName: document.querySelector('.user-name').innerText || "Admin",
            adminEmail: user.email,
            action: actionTitle,
            details: actionDetails,
            level: logLevel, // Tags it as Audit, Activity, or System
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.error("Logging failed:", e); }
}

async function uploadToCloudinary(file) {
    const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", "e-marketplace");
    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/dokaqnqg6/image/upload`, { method: "POST", body: formData });
        if (!res.ok) throw new Error("Cloudinary Upload Failed");
        const data = await res.json(); return data.secure_url; 
    } catch (err) { throw err; }
}


// ==========================================
// 8. UI & MODAL HELPERS 
// ==========================================
function triggerSkeleton(targetId, rows = 5, cols = 4) {
    const container = document.getElementById(targetId); if (!container) return;
    const isTable = container.tagName === 'TBODY'; let html = '';
    for (let i = 0; i < rows; i++) {
        if (isTable) {
            html += `<tr class="border-b border-gray-100 dark:border-dark-border">`;
            for (let j = 0; j < cols; j++) { html += `<td class="py-4 px-4"><div class="h-4 skeleton-box animate-skeleton w-3/4"></div></td>`; }
            html += `</tr>`;
        } else { html += `<div class="h-8 skeleton-box animate-skeleton mb-4 w-full rounded-lg"></div>`; }
    }
    container.innerHTML = html;
}

window.switchView = function(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('view-' + viewName); 
    if(target) target.classList.remove('hidden');

    if(viewName === 'transactions') { triggerSkeleton('tbody-transactions', 10, 8); renderTransactions(); }
    if(viewName === 'logs') { triggerSkeleton('tbody-logs', 10, 4); renderLogs(); }
    if(viewName === 'allItems') { triggerSkeleton('tbody-all-items', 8, 7); renderProducts(); }
    if(viewName === 'schoolListings') { triggerSkeleton('tbody-school-listings', 8, 5); renderSchoolListings(); }
    if(viewName === 'pendingApprovals') { triggerSkeleton('tbody-pending-approvals', 4, 5); renderPendingApprovals(); }
    if(viewName === 'inbox') { renderInbox(); } 

    document.querySelectorAll('.nav-item').forEach(el => {
        el.className = 'nav-item flex items-center px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border text-gray-600 dark:text-gray-400 cursor-pointer transition-colors group';
        const i = el.querySelector('i'); 
        if(i) { i.classList.remove('text-white'); i.classList.remove('text-gray-400'); }
    });

    const activeNav = document.getElementById('nav-' + viewName);
    if(activeNav) {
        activeNav.className = 'nav-item flex items-center px-3 py-2.5 rounded-lg active cursor-pointer transition-colors';
        activeNav.querySelectorAll('i').forEach(i => i.classList.remove('group-hover:text-[#852221]'));
    }
    
    document.getElementById('userDropdown').classList.add('hidden'); 
    if(window.lucide) lucide.createIcons();
};

window.switchUserTab = function(type) {
    currentTab = type;
    document.querySelectorAll('[id^="tab-"]').forEach(b => {
        b.className = 'page-tab-inactive pb-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white cursor-pointer';
        if(b.id === 'tab-unverified') b.classList.add('text-red-500');
    });
    const activeBtn = document.getElementById('tab-' + type);
    if(activeBtn) activeBtn.className = (type === 'unverified') ? 'page-tab-active-danger pb-3 text-sm font-bold border-b-2 border-red-500 text-red-600 cursor-pointer' : 'page-tab-active pb-3 text-sm font-bold border-b-2 border-[#852221] text-[#852221] cursor-pointer';
    ['customers', 'sellers', 'unverified'].forEach(t => document.getElementById('tbody-' + t).classList.add('hidden'));
    const tBody = document.getElementById('tbody-' + type); if(tBody) tBody.classList.remove('hidden');
};

window.openAddProductModal = function() {
    editingProductId = null; 
    document.querySelector('#addItemModal h3').innerText = "Add New Product";
    const saveBtn = document.querySelector('#addItemModal button.bg-[#852221]');
    if (saveBtn) saveBtn.textContent = "Save Product";
    openModal('addItemModal');
};

window.openModal = function(id) {
    const modal = document.getElementById(id); const dd = document.getElementById('userDropdown');
    if (dd) dd.classList.add('hidden'); if (!modal) return;
    if (modal.classList.contains('opacity-0') || modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        setTimeout(() => { modal.classList.remove('opacity-0'); const inner = modal.querySelector('div'); if(inner) { inner.classList.remove('scale-95'); inner.classList.add('scale-100'); } }, 10);
        if(id === 'addFinanceModal' && !document.getElementById('fin_date').value) document.getElementById('fin_date').valueAsDate = new Date();
    } else { modal.classList.add('open'); }
};

window.closeModal = function(id) {
    const modal = document.getElementById(id); if (!modal) return;
    if (modal.classList.contains('open')) { modal.classList.remove('open'); } 
    else {
        modal.classList.add('opacity-0'); const inner = modal.querySelector('div');
        if(inner) { inner.classList.remove('scale-100'); inner.classList.add('scale-95'); }
        setTimeout(() => { modal.classList.add('hidden'); }, 300);
    }
};

window.closeAndClearModal = function(id) {
    document.querySelectorAll(`#${id} input, #${id} textarea`).forEach(i => i.value = '');
    document.querySelectorAll(`#${id} select`).forEach(s => s.selectedIndex = 0);
    const mArea = document.querySelector(`#${id} .media-upload-area`);
    if(mArea) { mArea.innerHTML = `<i data-lucide="image" class="w-8 h-8 mx-auto text-gray-300 mb-2"></i><span class="text-xs text-gray-500">Click to Upload Image</span>`; if(window.lucide) lucide.createIcons(); }
    closeModal(id);
};

window.openVerifyModal = function(uid, email) { document.getElementById('v_uid').value = uid; document.getElementById('v_email').value = email; openModal('verifyUserModal'); };
window.openMyProfile = function() {
    const u = auth.currentUser;
    if(u) {
        document.getElementById('mp_email').value = u.email; document.getElementById('mp_uid').value = u.uid;
        document.getElementById('mp_name').value = document.querySelector('.user-name').innerText;
        document.getElementById('mp_role').value = document.querySelector('.user-role').innerText;
        document.getElementById('mp_img').src = document.getElementById('header-avatar').src;
        openModal('myProfileModal'); document.getElementById('userDropdown').classList.add('hidden');
    }
};

window.toggleUserDropdown = function() {
    const dd = document.getElementById('userDropdown');
    if (dd.classList.contains('hidden')) { dd.classList.remove('hidden'); setTimeout(() => { document.addEventListener('click', closeUserDropdownOutside); }, 10); } 
    else { dd.classList.add('hidden'); document.removeEventListener('click', closeUserDropdownOutside); }
};
function closeUserDropdownOutside(e) {
    const container = document.getElementById('userMenuContainer');
    if (container && !container.contains(e.target)) { document.getElementById('userDropdown').classList.add('hidden'); document.removeEventListener('click', closeUserDropdownOutside); }
}

function toggleTheme() {
    const html = document.documentElement; const icon = document.getElementById('theme-icon');
    if (html.classList.contains('dark')) { html.classList.remove('dark'); localStorage.setItem('theme', 'light'); if(icon) icon.setAttribute('data-lucide', 'moon'); } 
    else { html.classList.add('dark'); localStorage.setItem('theme', 'dark'); if(icon) icon.setAttribute('data-lucide', 'sun'); }
    if(window.lucide) lucide.createIcons(); 
}
if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark');

function setupSearch() {
    document.getElementById('globalSearch')?.addEventListener('input', (e) => {
        const table = document.querySelector('.view-section:not(.hidden) table');
        if (table) { const term = e.target.value.toLowerCase(); table.querySelectorAll('tbody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(term) ? '' : 'none'); }
    });
    document.getElementById('productSearch')?.addEventListener('input', (e) => {
        document.querySelectorAll('#allItemsTable tbody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(e.target.value.toLowerCase()) ? '' : 'none');
    });
    document.getElementById('userManagementSearch')?.addEventListener('input', (e) => {
        if (!document.getElementById('tbody-customers').classList.contains('hidden')) {
            document.querySelectorAll('#usersTable tbody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(e.target.value.toLowerCase()) ? '' : 'none');
        }
    });
}

window.viewProductDetails = function(id) {
    const p = globalProducts.find(x => x.id === id);
    if (!p) return;

    // Fill Modal Data
    document.getElementById('detail-img').src = p.Image || `https://ui-avatars.com/api/?name=${p.Product}&background=eee`;
    document.getElementById('detail-name').innerText = p.Product || 'Unnamed Item';
    document.getElementById('detail-id').innerText = `#${p.id.toUpperCase()}`;
    document.getElementById('detail-category').innerText = p.Category || 'General';
    document.getElementById('detail-price').innerText = `₱${(p.Price || 0).toLocaleString()}`;
    document.getElementById('detail-stock').innerText = `${p.Stock || 0} units`;
    document.getElementById('detail-recipient').innerText = p.Recipient || '--';
    document.getElementById('detail-status').innerText = p.Status || 'In Stock';
    
    // The missing piece: The Description
    const descEl = document.getElementById('detail-desc');
    descEl.innerText = p.Description && p.Description.trim() !== "" ? p.Description : "This item has no additional administrative notes or description.";

    if(window.lucide) lucide.createIcons();
    openModal('productDetailModal');
};


// ==========================================
// 9. CALENDAR & CHART
// ==========================================
function renderCalendar() {
    const monthYearEl = document.getElementById("calendar-month"); const gridEl = document.getElementById("calendar-grid");
    if (!monthYearEl || !gridEl) return;

    const year = currentCalendarDate.getFullYear(), month = currentCalendarDate.getMonth();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthYearEl.innerText = `${monthNames[month]} ${year}`; gridEl.innerHTML = "";

    const firstDayIndex = new Date(year, month, 1).getDay(); const lastDay = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDayIndex; i++) gridEl.appendChild(document.createElement("span"));

    const today = new Date();
    for (let i = 1; i <= lastDay; i++) {
        const dayEl = document.createElement("span"); dayEl.innerText = i;
        dayEl.className = "w-8 h-8 flex items-center justify-center rounded-full mx-auto cursor-pointer transition-all duration-200 text-sm";
        const isSelected = (i === selectedFullDate.getDate() && month === selectedFullDate.getMonth() && year === selectedFullDate.getFullYear());
        const isToday = (i === today.getDate() && month === today.getMonth() && year === today.getFullYear());

        if (isSelected) dayEl.classList.add("bg-[#852221]", "text-white", "shadow-md", "font-bold");
        else if (isToday) dayEl.classList.add("text-[#852221]", "font-bold", "border", "border-red-100");
        else dayEl.classList.add("hover:bg-gray-100", "dark:hover:bg-gray-800", "text-gray-600", "dark:text-gray-300");

        dayEl.onclick = () => selectDay(i); gridEl.appendChild(dayEl);
    }
}

function selectDay(day) {
    selectedFullDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), day);
    renderCalendar(); updateDashboardStats(); 
}

function changeMonth(direction) { currentCalendarDate.setMonth(currentCalendarDate.getMonth() + direction); renderCalendar(); }


// ==========================================
// 10. ON DOM LOAD INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    if(window.lucide) lucide.createIcons();
    setupSearch();
    
    // Handle Add and Edit Image Previews Dynamically
    ['inp_file', 'edit_file'].forEach(fileId => {
        const input = document.getElementById(fileId);
        if (input) {
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if(file) { 
                    const reader = new FileReader(); 
                    reader.onload = (ev) => {
                        const area = input.previousElementSibling;
                        if(area && area.classList.contains('media-upload-area')) {
                            area.innerHTML = `<img src="${ev.target.result}" class="w-full h-32 object-contain rounded-lg">`; 
                        }
                    }; 
                    reader.readAsDataURL(file); 
                }
            });
        }
    });
    
    // Profile Avatar Preview
    const mpFile = document.getElementById('mp_file');
    if(mpFile) {
        mpFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if(file) { const reader = new FileReader(); reader.onload = (e) => document.getElementById('mp_img').src = e.target.result; reader.readAsDataURL(file); }
        });
    }

    renderCalendar();

    // Chart Init
    const ctx = document.getElementById('financeChart');
    if(ctx && window.Chart) {
        if (window.myFinanceChart) window.myFinanceChart.destroy();
        window.myFinanceChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: ['Week 01', 'Week 02', 'Week 03', 'Week 04'], datasets: [{ label: 'Income', data: [0, 0, 0, 0], backgroundColor: '#852221', borderRadius: 4, barPercentage: 0.5 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 1000, grid: { borderDash: [5, 5] } }, x: { grid: { display: false } } } }
        });
    }
});

// ==========================================
// 11. Smart Filtering Logic
// ==========================================

window.switchLogTab = function(level) {
    currentLogTab = level;
    // UI Update
    document.querySelectorAll('[id^="log-tab-"]').forEach(btn => {
        btn.className = 'pb-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700';
    });
    const activeBtn = document.getElementById('log-tab-' + level);
    activeBtn.className = 'pb-3 text-sm font-bold border-b-2 border-primary text-primary';
    
    renderLogs();
};

window.switchLogTab = function(level) {
    currentLogTab = level;
    document.querySelectorAll('[id^="log-tab-"]').forEach(btn => {
        btn.className = 'pb-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 cursor-pointer';
    });
    const activeBtn = document.getElementById('log-tab-' + level);
    if(activeBtn) activeBtn.className = 'pb-3 text-sm font-bold border-b-2 border-[#852221] text-[#852221] cursor-pointer';
    
    renderLogs();
};

function renderLogs() {
    const tbody = document.getElementById('tbody-logs'); 
    if (!tbody) return;
    
    triggerSkeleton('tbody-logs', 10, 4);

    db.collection('logs')
        .where('level', '==', currentLogTab) 
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get()
        .then(snap => {
            tbody.innerHTML = ''; 
            
            if (snap.empty) { 
                tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-16 text-center text-gray-400 italic">No ${currentLogTab} records found.</td></tr>`;
                return; 
            }

            let html = '';
            snap.forEach(doc => {
                const d = doc.data();
                const time = d.timestamp ? d.timestamp.toDate().toLocaleString('en-GB', {hour: '2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'}) : 'Just now';
                
                let badgeClasses = "text-blue-600 bg-blue-50 dark:bg-blue-900/20";
                if(currentLogTab === 'Audit') badgeClasses = "text-red-600 bg-red-50 dark:bg-red-900/20";
                if(currentLogTab === 'System') badgeClasses = "text-amber-600 bg-amber-50 dark:bg-amber-900/20";

                html += `
                <tr class="hover:bg-gray-50 dark:hover:bg-dark-border transition-all border-b dark:border-dark-border">
                    <td class="pl-12 pr-6 py-4 text-gray-400 text-xs font-mono w-[20%] whitespace-nowrap">
                        ${time}
                    </td>
                    
                    <td class="px-10 py-4 font-semibold text-gray-700 dark:text-gray-300 w-[20%] truncate">
                        ${d.adminName || 'Admin'}
                    </td>
                    
                    <td class="px-10 py-4 w-[25%]">
                        <span class="inline-flex items-center justify-center px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter whitespace-nowrap ${badgeClasses} shadow-sm">
                            ${d.action}
                        </span>
                    </td>
                    
                    <td class="pl-10 pr-12 py-4 text-gray-400 font-mono text-xs italic w-[35%]">
                        <div class="line-clamp-1 hover:line-clamp-none transition-all duration-300 cursor-help">
                            ${d.details}
                        </div>
                    </td>
                </tr>`;
            });
            tbody.innerHTML = html;
        });
}

window.promoteUser = async function(targetUid) {
    // 1. Get the current logged-in role from the sidebar (Hardened Check)
    const roleEl = document.querySelector('.user-role');
    const loggedInRole = roleEl ? roleEl.innerText.trim().toUpperCase() : "";
    
    // 2. Find the user we want to promote
    const targetUser = globalUsers.find(u => (u.id || u.uid) === targetUid);
    if (!targetUser) return alert("User not found.");

    // Define placeholders for the new data
    let newType = (targetUser.type || targetUser.userType || "Customer");
    let newRole = "";

    // 3. The Logic Gate (Case-Insensitive)
    if (loggedInRole === "SUPER ADMIN") {
        // Super Admin can turn Staff into Admin
        if (newType === "Staff") {
            newRole = "Admin";
        } else {
            return alert("Super Admins can only promote Staff to Admin.");
        }
    } 
    else if (loggedInRole === "ADMIN") {
        // Admin can turn Customer into Staff
        if (newType === "Customer") {
            newType = "Staff";
            newRole = "User";
        } else {
            return alert("Admins can only promote Customers to Staff.");
        }
    } 
    else {
        console.log("Team Debug - Failed Role Check:", loggedInRole);
        return alert("You do not have permission to promote users.");
    }

    // 4. Execute Firebase Update
    if (confirm(`Promote ${targetUser.name} to ${newRole === 'Admin' ? 'Admin' : 'Staff'}?`)) {
        try {
            await db.collection('users').doc(targetUid).update({
                type: newType,
                userType: newType, // Keeps both fields synced
                role: newRole,
                promotedBy: auth.currentUser.email,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // 5. Log the Audit Trail
            await logAction("User Promotion", `Promoted ${targetUser.name} to ${newRole}`, "Audit");
            
            alert("Promotion successful!");

            // Refresh the UI so the button disappears and badges update
            if (typeof renderUsers === 'function') renderUsers();

        } catch (e) {
            console.error("Promotion Error:", e);
            alert("Failed to update user. Check Firebase Rules.");
        }
    }
};
