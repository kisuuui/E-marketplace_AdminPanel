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

// --- CLOUDINARY UPLOAD HELPER ---
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
        return data.secure_url; 
        
    } catch (error) {
        console.error("Upload Error:", error);
        throw error;
    }
}

// --- SYSTEM LOGGING ENGINE ---
async function logAction(actionTitle, actionDetails) {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const adminName = document.querySelector('.user-name').innerText || "Unknown Admin";

        await db.collection('logs').add({
            adminId: user.uid,
            adminName: adminName,
            adminEmail: user.email,
            action: actionTitle,
            details: actionDetails,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("Action Logged:", actionTitle);
    } catch (e) {
        console.error("Logging failed:", e);
    }
}

const PROFIT_PERCENTAGE = 0.12; // 12% Admin Commission

function renderLogs() {
    const tbody = document.getElementById('tbody-logs');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-gray-400 italic">Loading...</td></tr>';

    db.collection('logs')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get()
      .then(snap => {
          if (snap.empty) {
              tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-gray-400 italic">No logs found.</td></tr>';
              return;
          }

          let html = '';
          snap.forEach(doc => {
              const d = doc.data();
              const date = d.timestamp ? d.timestamp.toDate().toLocaleString() : 'Just now';
              
              html += `
              <tr class="hover:bg-gray-50 dark:hover:bg-dark-border transition-colors">
                  <td class="px-6 py-4 text-gray-500 text-xs font-mono">${date}</td>
                  <td class="px-6 py-4 font-medium text-gray-700 dark:text-white">
                      <div class="flex items-center gap-2">
                          <div class="w-6 h-6 rounded-full bg-[#852221] text-white flex items-center justify-center text-xs font-bold">${d.adminName[0]}</div>
                          ${d.adminName}
                      </div>
                  </td>
                  <td class="px-6 py-4 text-blue-600 dark:text-blue-400 font-medium">${d.action}</td>
                  <td class="px-6 py-4 text-gray-500 dark:text-gray-400 font-mono text-xs">${d.details}</td>
              </tr>`;
          });
          tbody.innerHTML = html;
      })
      .catch(e => {
          console.error(e);
          tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-red-500">Access Denied: You are not a Super Admin.</td></tr>`;
      });
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
            
            // ROLE CHECK: If Super Admin, show Logs button
            if (data.role === 'Super Admin') {
                const logBtn = document.getElementById('nav-logs');
                if (logBtn) logBtn.classList.remove('hidden');
            }

            await userRef.update({ lastLogin: timestamp });
        } else {
            const newProfile = { 
                name: "Admin User", 
                email: user.email, 
                role: "Admin", // Default is NOT Super Admin
                createdAt: timestamp, 
                lastLogin: timestamp 
            };
            await userRef.set(newProfile);
            updateProfileUI(newProfile.name, newProfile.role, user.email);
        }
    } catch (error) { console.error("Profile Error", error); }
}


// --- RENDER DASHBOARD ORDER HISTORY WIDGET ---
function renderOrderHistoryWidget() {
    const tbody = document.getElementById('finance-orders-table');
    if (!tbody) return; // Stop if we aren't on the dashboard

    // Use your existing 'financials' collection
    db.collection('financials')
      .orderBy('date', 'desc')
      .limit(5) // Limit to 5 for the dashboard widget
      .onSnapshot(snap => { // Use onSnapshot for real-time updates
          if (snap.empty) {
              tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-gray-400 italic">No recent orders.</td></tr>';
              return;
          }

          let html = '';
          snap.forEach(doc => {
              const data = doc.data();
              
              // Map your existing Firestore fields to the Table columns
              const customer = data.buyerName || "Walk-in Customer";
              const product = data.itemName || "Unknown Item";
              
              // Format Date
              const dateObj = data.date ? data.date.toDate() : new Date();
              const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              
              const amount = data.amount || 0;
              
              // Logic for Status: Your financials don't have a 'status' field yet, 
              // so we default to "Completed" for income, or check if you add one later.
              const status = data.status || 'Completed'; 
              
              let statusColor = 'bg-green-100 text-green-600';
              if(status === 'Pending') statusColor = 'bg-yellow-100 text-yellow-600';
              if(status === 'Cancelled') statusColor = 'bg-red-100 text-red-600';

              html += `
                <tr class="border-b border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td class="py-4 font-medium text-gray-800 dark:text-gray-200">${customer}</td>
                    <td class="py-4 text-gray-600 dark:text-gray-400">${product}</td>
                    <td class="py-4 text-gray-600 dark:text-gray-400">${dateStr}</td>
                    <td class="py-4 text-right font-medium text-gray-800 dark:text-gray-200">₱${amount.toLocaleString()}</td>
                    <td class="py-4 text-right">
                        <span class="px-3 py-1 text-xs font-semibold rounded-full ${statusColor}">
                            ${status}
                        </span>
                    </td>
                </tr>
              `;
          });
          
          tbody.innerHTML = html;
      });
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

// --- UPDATED DATA LISTENERS ---
function initDataListeners() {
    // 1. Listen for Product Changes
    db.collection('products').orderBy('createdAt', 'desc').onSnapshot(snap => {
        globalProducts = [];
        snap.forEach(d => globalProducts.push({ id: d.id, ...d.data() }));
        renderProducts();
        updateDashboardStats(); 
    });

    // 2. Listen for User Changes
    db.collection('users').orderBy('createdAt', 'desc').onSnapshot(snap => {
        globalUsers = [];
        snap.forEach(d => globalUsers.push({ id: d.id, ...d.data() }));
        renderUsers();
        updateDashboardStats(); 
    });

    // 3. Listen for Financial Changes (Fixed to trigger UI updates)
    db.collection('financials').onSnapshot(() => {
        updateDashboardStats(); // This handles both cards and the graph
    });
    
    renderOrderHistoryWidget();
}

// --- UPDATED DASHBOARD ANALYTICS (12% Profit & Graph Fix) ---
function updateDashboardStats() {
    // 1. Products & Users count
    const activeProducts = globalProducts.filter(p => (p.Status || '').toLowerCase() === 'in stock').length;
    const totalUsers = globalUsers.length;

    if(document.getElementById('dash-active-products')) 
        document.getElementById('dash-active-products').innerText = activeProducts;
    if(document.getElementById('dash-total-users')) 
        document.getElementById('dash-total-users').innerText = totalUsers;

    // 2. Calculate Revenue (12% Profit Margin)
    db.collection('financials').get().then(snap => {
        let netProfit = 0;
        let transactionCount = 0;
        let weeklyBuckets = [0, 0, 0, 0]; 
        const today = new Date();

        snap.forEach(doc => {
            const d = doc.data();
            if(d.type === 'Income') {
                // Safety: Ensure amount is a number
                const amount = parseFloat(d.amount) || 0;
                const adminProfit = amount * PROFIT_PERCENTAGE; 
                
                netProfit += adminProfit; 
                transactionCount++;

                // 3. Week Mapping for Graph
                if (d.date) {
                    const date = d.date.toDate(); 
                    const diffDays = Math.ceil(Math.abs(today - date) / (1000 * 60 * 60 * 24));
                    let weekIndex = 3 - Math.floor(diffDays / 7);
                    
                    if (weekIndex >= 0 && weekIndex <= 3) {
                        weeklyBuckets[weekIndex] += adminProfit;
                    }
                }
            }
        });

        // 4. Update UI Cards
        const rDisplay = document.getElementById('dash-total-revenue');
        const tDisplay = document.getElementById('dash-total-orders') || document.getElementById('dash-total-transactions');
        
        if(rDisplay) rDisplay.innerText = "₱" + netProfit.toLocaleString(undefined, {minimumFractionDigits: 2});
        if(tDisplay) tDisplay.innerText = transactionCount;

        // 5. Update Graph and Auto-Scale
        if (window.myFinanceChart) {
            window.myFinanceChart.data.datasets[0].data = weeklyBuckets;
            
            // Auto-scale fix: Adjust Y-axis if profit is small
            const maxProfit = Math.max(...weeklyBuckets);
            window.myFinanceChart.options.scales.y.max = maxProfit > 0 ? maxProfit * 1.5 : 1000;
            
            window.myFinanceChart.update();
        }
    }).catch(err => console.error("Dashboard Sync Error:", err));
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

        if (file) {
            imageUrl = await uploadToCloudinary(file);
        } else {
            imageUrl = `https://ui-avatars.com/api/?name=${name}&background=eee`;
        }
        
        const docRef = await db.collection('products').add({
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

        // LOGGING
        await logAction("Created Product", `Item: ${name} (ID: ${docRef.id})`);
        
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

        // LOGGING
        await logAction("Created User", `Name: ${name} (${email})`);
        
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
            // LOGGING
            await logAction("Deleted Item", `Collection: ${collection}, ID: ${id}`);
        } catch (error) {
            alert("Error deleting: " + error.message);
        }
    }
};

// --- SAVE FINANCIAL RECORD (Updated for Full Details) ---
window.saveFinancialRecord = async function() {
    // 1. Get Values from New Inputs
    const dateVal = document.getElementById('fin_date').value;
    const refIdVal = document.getElementById('fin_refId').value.trim();
    const buyerVal = document.getElementById('fin_buyer').value.trim();
    const recipientVal = document.getElementById('fin_recipient').value.trim();
    const itemVal = document.getElementById('fin_item').value.trim();
    const categoryVal = document.getElementById('fin_category').value;
    const amountVal = document.getElementById('fin_amount').value;
    const descVal = document.getElementById('fin_desc').value.trim();

    // 2. Validate Required Fields
    if (!amountVal || !buyerVal || !itemVal) {
        return alert("Please fill in Amount, Buyer Name, and Item Name.");
    }
    const amount = parseFloat(amountVal);

    // 3. Button Loading State
    const btn = document.querySelector('#addFinanceModal button[onclick="saveFinancialRecord()"]');
    let originalText = "Save Record";
    if (btn) {
        originalText = btn.textContent;
        btn.textContent = "Saving...";
        btn.disabled = true;
    }

    try {
        let recordDate = dateVal ? new Date(dateVal) : new Date();
        
        // 4. Save to Firestore (Full Object)
        await db.collection('financials').add({
            type: "Income",
            date: recordDate,
            refId: refIdVal || "AUTO-" + Date.now().toString().slice(-6), // Fallback if empty
            buyerName: buyerVal,
            recipient: recipientVal || "General Fund",
            itemName: itemVal,
            category: categoryVal,
            amount: amount,
            description: descVal,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: auth.currentUser ? auth.currentUser.email : 'System'
        });

        // 5. Log it
        await logAction("Recorded Income", `Sold: ${itemVal} to ${buyerVal} for ₱${amount}`);

        alert("Transaction Saved Successfully!");
        closeAndClearModal('addFinanceModal');
        
        // Refresh Table
        if(typeof renderTransactions === 'function') renderTransactions();

    } catch (error) {
        console.error("Error saving record:", error);
        alert("Error: " + error.message);
    } finally {
        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
};

// --- MODAL & TAB UTILS ---

window.switchView = function(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    
    const target = document.getElementById('view-' + viewName);
    if(target) target.classList.remove('hidden');

    if(viewName === 'transactions') renderTransactions();
    if(viewName === 'logs') renderLogs();

    // Update Navigation Highlights
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

// --- UNIVERSAL MODAL UTILS (The Fix) ---

window.openModal = function(id) {
    const modal = document.getElementById(id);
    const dropdown = document.getElementById('userDropdown');
    
    if (dropdown) dropdown.classList.add('hidden');
    if (!modal) return;

    // CHECK: Is this the New Finance Modal? (Tailwind based)
    if (modal.classList.contains('opacity-0') || modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            const inner = modal.querySelector('div');
            if(inner) {
                inner.classList.remove('scale-95');
                inner.classList.add('scale-100');
            }
        }, 10);

        // Auto-set Date for Finance
        if(id === 'addFinanceModal') {
            const dateInput = document.getElementById('fin_date');
            if(dateInput && !dateInput.value) dateInput.valueAsDate = new Date();
        }
    } else {
        // OLD MODAL LOGIC (CSS Class based)
        modal.classList.add('open');
    }
};

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    // CHECK: How is this modal currently open?
    if (modal.classList.contains('open')) {
        // OLD MODAL: Just remove the class
        modal.classList.remove('open');
    } else {
        // NEW MODAL: Use animation
        modal.classList.add('opacity-0');
        const inner = modal.querySelector('div');
        if(inner) {
            inner.classList.remove('scale-100');
            inner.classList.add('scale-95');
        }
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    }
};

window.closeAndClearModal = function(id) {
    // Clear inputs
    document.querySelectorAll(`#${id} input, #${id} textarea`).forEach(i => i.value = '');
    document.querySelectorAll(`#${id} select`).forEach(s => s.selectedIndex = 0);

    // Reset Image Preview
    const mediaArea = document.querySelector(`#${id} .media-upload-area`);
    if(mediaArea) {
        mediaArea.innerHTML = `
            <i data-lucide="image" class="w-8 h-8 mx-auto text-gray-300 mb-2"></i>
            <span class="text-xs text-gray-500">Click to Upload Image</span>
        `;
        lucide.createIcons(); 
    }
    
    // Call the UNIVERSAL close function
    closeModal(id);
};


window.closeAndClearModal = function(id) {
    // Clear all inputs
    document.querySelectorAll(`#${id} input, #${id} textarea`).forEach(i => i.value = '');
    
    // Reset Select dropdowns
    document.querySelectorAll(`#${id} select`).forEach(s => s.selectedIndex = 0);

    // Reset Image Preview box
    const mediaArea = document.querySelector(`#${id} .media-upload-area`);
    if(mediaArea) {
        mediaArea.innerHTML = `
            <i data-lucide="image" class="w-8 h-8 mx-auto text-gray-300 mb-2"></i>
            <span class="text-xs text-gray-500">Click to Upload Image</span>
        `;
        lucide.createIcons(); 
    }

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

    // LOGGING
    await logAction("Verified User", `User: ${name} (ID: ${uid})`);

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
        
        // LOGGING
        await logAction("Updated Profile", `Admin: ${name}`);

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

// --- CALENDAR LOGIC ---
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
    
    // 1. Media Upload Click Trigger
    const inpFile = document.getElementById('inp_file');
    const mediaArea = document.querySelector('.media-upload-area');

    if(inpFile && mediaArea) {
        inpFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const previewUrl = e.target.result;
                    mediaArea.innerHTML = `<img src="${previewUrl}" class="w-full h-32 object-contain rounded-lg">`;
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    // 2. PROFILE IMAGE PREVIEW
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

    // 3. Init Calendar
    if(typeof renderCalendar === "function") renderCalendar();

    // 4. Init Chart (INCOME ONLY)
    const ctx = document.getElementById('financeChart');
    if(ctx) {
        if (window.myFinanceChart) window.myFinanceChart.destroy();
        window.myFinanceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Week 01', 'Week 02', 'Week 03', 'Week 04'],
                datasets: [
                    { 
                        label: 'Income', 
                        data: [0, 0, 0, 0], 
                        backgroundColor: '#852221', 
                        borderRadius: 4, 
                        barPercentage: 0.5 
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, max: 10000, grid: { borderDash: [5, 5] } }, x: { grid: { display: false } } }
            }
        });
    }
}); // <--- CLOSED HERE (This was the missing piece!)

// --- TRANSACTION HISTORY ENGINE (Updated for Mobile Data) ---
function renderTransactions() {
    const tbody = document.getElementById('tbody-transactions');
    const totalDisplay = document.getElementById('total-income-display');
    
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-8 text-center text-gray-400 italic">Syncing with mobile records...</td></tr>';

    db.collection('financials')
      .orderBy('date', 'desc')
      .limit(50)
      .get()
      .then(snap => {
          if (snap.empty) {
              tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-8 text-center text-gray-400 italic">No transactions found.</td></tr>';
              if(totalDisplay) totalDisplay.innerText = "₱0.00";
              return;
          }

          let html = '';
          let totalIncome = 0;

          snap.forEach(doc => {
              const d = doc.data();
              const amount = d.amount || 0;
              totalIncome += amount;

              // 1. DATE
              const date = d.date ? new Date(d.date.seconds * 1000).toLocaleDateString() : 'N/A';
              
              // 2. BUYER (Fallback to 'Walk-in' or 'System' if missing)
              const buyer = d.buyerName || d.buyer || 'System/Walk-in';

              // 3. ITEM
              const item = d.itemName || d.product || '--';

              // 4. CATEGORY
              const category = d.category || 'General';

              // 5. DESCRIPTION
              const desc = d.description || 'No description';

              // 6. RECIPIENT (Who got the money? School? Dept?)
              const recipient = d.recipient || d.sellerName || 'Admin';

              // 7. REF ID (Use specific refId field, or fallback to Document ID)
              const refId = d.refId || doc.id.substring(0, 8).toUpperCase();

              html += `
              <tr class="hover:bg-gray-50 dark:hover:bg-dark-border transition-colors text-sm">
                  <td class="px-6 py-4 text-gray-500 font-mono whitespace-nowrap">${date}</td>
                  <td class="px-6 py-4 font-medium text-gray-800 dark:text-white">${buyer}</td>
                  <td class="px-6 py-4 text-gray-600 dark:text-gray-300">${item}</td>
                  <td class="px-6 py-4"><span class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-500">${category}</span></td>
                  <td class="px-6 py-4 text-right font-bold text-green-600 whitespace-nowrap">+₱${amount.toLocaleString()}</td>
                  <td class="px-6 py-4 text-gray-500 text-xs max-w-[200px] truncate" title="${desc}">${desc}</td>
                  <td class="px-6 py-4 text-gray-600 dark:text-gray-400 text-xs">${recipient}</td>
                  <td class="px-6 py-4 text-right text-xs font-mono text-gray-400">#${refId}</td>
              </tr>`;
          });

          tbody.innerHTML = html;
          if(totalDisplay) totalDisplay.innerText = "₱" + totalIncome.toLocaleString();
      })
      .catch(e => {
          console.error(e);
          tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-8 text-center text-red-400">Error loading data.</td></tr>';
      });
}

// --- NEW: GRAPH CALCULATOR ENGINE ---
function updateFinanceChart() {
    const ctx = document.getElementById('financeChart');
    // Ensure the chart instance exists before updating
    if (!ctx || !window.myFinanceChart) return; 

    // Setup 4 buckets for Week 01, Week 02, Week 03, Week 04
    let weeklyProfit = [0, 0, 0, 0]; 
    const today = new Date();

    db.collection('financials')
      .orderBy('date', 'asc')
      .get()
      .then(snap => {
          snap.forEach(doc => {
              const d = doc.data();
              // Only process "Income" and ensure a date exists
              if (d.type === 'Income' && d.date) {
                  const date = d.date.toDate();
                  const amount = d.amount || 0;
                  const myProfit = amount * PROFIT_PERCENTAGE; // Calculate 12% profit

                  // Determine which week bucket the transaction falls into
                  const diffTime = Math.abs(today - date);
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                  
                  // 0-7 days = Week 4, 8-14 = Week 3, etc.
                  let weekIndex = 3 - Math.floor(diffDays / 7);
                  
                  if (weekIndex >= 0 && weekIndex <= 3) {
                      weeklyProfit[weekIndex] += myProfit;
                  }
              }
          });

          // Update the Chart.js data
          window.myFinanceChart.data.datasets[0].data = weeklyProfit;
          window.myFinanceChart.update();
      })
      .catch(e => console.error("Graph Sync Error:", e));
}

function updateDashboardStats() {
    // 1. Existing Product/User counts
    const activeProducts = globalProducts.filter(p => (p.Status || '').toLowerCase() === 'in stock').length;
    const totalUsers = globalUsers.length;
    if(document.getElementById('dash-active-products')) document.getElementById('dash-active-products').innerText = activeProducts;
    if(document.getElementById('dash-total-users')) document.getElementById('dash-total-users').innerText = totalUsers;

    // 2. Financial Calculation & Smart Sorting
    db.collection('financials').orderBy('date', 'desc').get().then(snap => {
        let netProfit = 0;
        let totalOverallSales = 0;
        let transactionCount = 0;
        let weeklyBuckets = [0, 0, 0, 0]; // [Week 1, Week 2, Week 3, Week 4]
        let allTransactions = []; 
        
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        snap.forEach(doc => {
            const d = doc.data();
            if(d.type === 'Income' && d.date) {
                const date = d.date.toDate();
                const amount = parseFloat(d.amount) || 0;
                
                // Track Lifetime Totals
                totalOverallSales += amount;
                const adminProfit = amount * PROFIT_PERCENTAGE; // 12%
                netProfit += adminProfit;
                transactionCount++;

                // Keep track of all items for the table
                allTransactions.push({ id: doc.id, ...d });

                // SMART WEEK Logic: Only graph data from the CURRENT MONTH
                if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
                    const dayOfMonth = date.getDate();
                    let weekIndex;

                    if (dayOfMonth <= 7) weekIndex = 0;      // Week 1
                    else if (dayOfMonth <= 14) weekIndex = 1; // Week 2
                    else if (dayOfMonth <= 21) weekIndex = 2; // Week 3 (Feb 18 is here)
                    else weekIndex = 3;                       // Week 4

                    weeklyBuckets[weekIndex] += adminProfit;
                }
            }
        });

        // 3. UPDATE UI CARDS
        const formattedNet = "₱" + netProfit.toLocaleString(undefined, {minimumFractionDigits: 2});
        const formattedGross = "₱" + totalOverallSales.toLocaleString(undefined, {minimumFractionDigits: 2});

        if(document.getElementById('dash-total-revenue')) document.getElementById('dash-total-revenue').innerText = formattedNet;
        if(document.getElementById('fin-total-revenue')) document.getElementById('fin-total-revenue').innerText = formattedNet;
        if(document.getElementById('dash-total-overall-sales')) document.getElementById('dash-total-overall-sales').innerText = formattedGross;
        if(document.getElementById('dash-total-orders')) document.getElementById('dash-total-orders').innerText = transactionCount;

        // 4. RENDER ORDER HISTORY (LIMIT TO 4)
        const orderHistoryBody = document.getElementById('finance-orders-table');
        if (orderHistoryBody) {
            const recentFour = allTransactions.slice(0, 4);
            orderHistoryBody.innerHTML = recentFour.map(order => {
                const dateStr = order.date ? order.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
                return `
                    <tr class="border-b border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <td class="py-4 font-medium text-gray-800 dark:text-gray-200">${order.buyerName || 'Walk-in'}</td>
                        <td class="py-4 text-gray-600 dark:text-gray-400">${order.itemName || 'Item'}</td>
                        <td class="py-4 text-gray-600 dark:text-gray-400">${dateStr}</td>
                        <td class="py-4 text-right font-medium text-gray-800 dark:text-gray-200">₱${parseFloat(order.amount).toLocaleString()}</td>
                        <td class="py-4 text-right">
                            <span class="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-600">Completed</span>
                        </td>
                    </tr>`;
            }).join('');
        }

        // 5. UPDATE GRAPH (10,000 Goal)
        if (window.myFinanceChart) {
            window.myFinanceChart.data.datasets[0].data = weeklyBuckets;
            window.myFinanceChart.options.scales.y.min = 0;
            window.myFinanceChart.options.scales.y.max = 1000;
            window.myFinanceChart.update();
        }
    });
}
