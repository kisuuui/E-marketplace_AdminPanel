(function () {
    const navItems = [
        { page: "Dashboard", href: "Dashboard.html", script: "js/dashboard.js", label: "Dashboard", icon: "home", roles: [1, 2] },
        { page: "AllItems", href: "AllItems.html", script: "js/allItems.js", label: "All Items", icon: "layers", roles: [1, 2] },
        { page: "Inbox", href: "Inbox.html", script: "js/inbox.js", label: "Inbox", icon: "message-square", roles: [1, 2] },
        { page: "PendingApprovals", href: "PendingApprovals.html", script: "js/pendingApprovals.js", label: "Pending Approvals", icon: "file-clock", roles: [1] },
        { page: "SchoolListings", href: "SchoolListings.html", script: "js/schoolListings.js", label: "School Listings", icon: "graduation-cap", roles: [1, 2] },
        { page: "Orders", href: "Orders.html", script: "js/orders.js", label: "Ongoing Orders", icon: "shopping-bag", roles: [1, 2] },
        { page: "UserManagement", href: "UserManagement.html", script: "js/userManagement.js", label: "User Management", icon: "users", roles: [1, 2] },
        { page: "Categories", href: "Categories.html", script: "js/categories.js", label: "Categories", icon: "tags", roles: [1] },
        { page: "FinancialReports", href: "FinancialReports.html", script: "js/financialReports.js", label: "Financial Reports", icon: "bar-chart-3", roles: [1] },
        { page: "TransactionHistory", href: "TransactionHistory.html", script: "js/transactionHistory.js", label: "Transaction History", icon: "credit-card", roles: [1] },
        { page: "SystemLogs", href: "SystemLogs.html", script: "js/systemLogs.js", label: "System Logs", icon: "scroll-text", roles: [1] }
    ];
    const loadedScripts = new Set(Array.from(document.scripts).map(script => script.getAttribute("src")).filter(Boolean));
    let softNavigationBound = false;

    function renderLayout(activePage) {
        const shell = document.getElementById("app-shell");
        if (!shell) return;

        const profile = window.AppState.profile || {};
        const rank = window.AppRoles.normalizeRoleRank(profile);
        const visibleItems = navItems.filter(item => item.roles.includes(rank));

        let sidebar = shell.querySelector(".app-sidebar");
        if (!sidebar) {
            shell.insertAdjacentHTML("afterbegin", `
                <aside class="app-sidebar">
                    <a href="Dashboard.html" class="brand-row" data-soft-nav="true">
                        <img src="logo.png" alt="SCC Logo">
                        <span>SCC <strong>E-COMMERCE</strong></span>
                    </a>
                    <nav class="sidebar-nav"></nav>
                    <div class="sidebar-profile">
                        <a class="sidebar-profile-link" href="Profile.html" data-soft-nav="true">
                            <img data-user-avatar src="" alt="Profile">
                            <div>
                                <strong data-user-name>Admin User</strong>
                                <span data-user-role>Admin</span>
                            </div>
                        </a>
                        <button type="button" title="Logout" onclick="AppAuth.logout()"><i data-lucide="log-out"></i></button>
                    </div>
                </aside>
            `);
            sidebar = shell.querySelector(".app-sidebar");
        }

        const nav = sidebar.querySelector(".sidebar-nav");
        if (nav) {
            nav.innerHTML = `
                <span class="nav-section">Apps & Pages</span>
                ${visibleItems.map(item => `
                    <a class="nav-link ${item.page === activePage ? "active" : ""}" href="${item.href}" data-soft-nav="true">
                        <i data-lucide="${item.icon}"></i>
                        <span>${item.label}</span>
                    </a>
                `).join("")}
            `;
        }

        const topbar = document.getElementById("topbar");
        if (topbar) {
            topbar.innerHTML = `
                <div>
                    <p class="eyebrow">Dashboards / <span>${pageTitle(activePage)}</span></p>
                    <h1>${pageTitle(activePage)}</h1>
                </div>
                <div class="topbar-actions">
                    <span class="role-chip" data-user-role>Admin</span>
                    <button type="button" class="icon-btn" onclick="AppLayout.toggleTheme()" title="Theme"><i id="theme-icon" data-lucide="moon"></i></button>
                    <a class="profile-pill" href="Profile.html" data-soft-nav="true">
                        <img data-user-avatar src="" alt="Profile">
                        <span data-user-name>Admin User</span>
                    </a>
                </div>
            `;
        }

        updateThemeIcon();
        window.AppAuth.updateProfileUI();
        bindSoftNavigation();
        if (window.lucide) lucide.createIcons();
    }

    function getNavItemByHref(href) {
        const normalizedHref = getPageFileName(href);
        if (normalizedHref === "Profile.html") {
            return { page: "Profile", href: "Profile.html", script: "js/profile.js", label: "Profile" };
        }
        return navItems.find(item => item.href === normalizedHref);
    }

    function isMainPanelHref(href) {
        const file = getPageFileName(href);
        if (file === "Profile.html") return true;
        return navItems.some(item => item.href === file);
    }

    function getPageFileName(href) {
        try {
            return new URL(href, window.location.href).pathname.split("/").pop();
        } catch (error) {
            return href.split(/[?#]/)[0].split("/").pop();
        }
    }

    async function loadPageScript(item) {
        if (!item?.script) return;
        if (window.AppPages?.[item.page]) return false;

        await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = item.script;
            script.onload = resolve;
            script.onerror = reject;
            loadedScripts.add(item.script);
            document.body.appendChild(script);
        });
        return true;
    }

    async function navigateTo(href, options = {}) {
        const item = getNavItemByHref(href);
        if (!item) {
            window.location.href = href;
            return;
        }

        const currentFile = getPageFileName(window.location.pathname);
        if (currentFile === item.href && !options.replace) return;

        const currentContent = getMainPageContent(document);
        const response = await fetch(item.href, { cache: "no-store" });
        if (!response.ok) throw new Error(`Unable to load ${item.href}`);

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const nextContent = getMainPageContent(doc);
        if (!nextContent || !currentContent) {
            showPageError(currentContent, `The page content for ${item.href} could not be found.`);
            return;
        }

        currentContent.replaceWith(nextContent);
        document.title = doc.title || `${pageTitle(item.page)} | SCC Admin`;
        if (!options.replace) {
            window.history.pushState({ page: item.page }, "", item.href);
        }

        const loadedNow = await loadPageScript(item);
        if (!loadedNow && window.AppPages?.[item.page]) {
            await window.AppPages[item.page]({ softNavigation: true });
        } else if (!window.AppPages?.[item.page]) {
            renderLayout(item.page);
        }
        window.scrollTo({ top: 0, behavior: "instant" });
    }

    function getMainPageContent(root) {
        const appMain = root.querySelector(".app-main");
        if (!appMain) return root.querySelector(".page-content");
        return Array.from(appMain.children).find(child => child.classList?.contains("page-content")) || null;
    }

    function bindSoftNavigation() {
        if (softNavigationBound) return;
        softNavigationBound = true;

        document.addEventListener("click", event => {
            const target = getSoftNavigationTarget(event);
            if (!target) return;

            event.preventDefault();
            navigateTo(target.href).catch(error => {
                console.error("Soft navigation failed:", error);
                showPageError(document.querySelector(".app-main .page-content"), "This panel needs to be opened through a local server so page sections can load without refreshing.");
            });
        });
    }

    function getSoftNavigationTarget(event) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return null;
        }

        if (!(event.target instanceof Element)) return null;

        const link = event.target.closest("a[href]");
        if (!link) return null;
        if (link.target && link.target !== "_self") return null;

        const href = link.getAttribute("href");
        if (!href || href.startsWith("#")) return null;
        if (!isMainPanelHref(href)) return null;

        let url;
        try {
            url = new URL(href, window.location.href);
        } catch (error) {
            return null;
        }

        const samePageOrigin = url.origin === window.location.origin || (url.protocol === "file:" && window.location.protocol === "file:");
        if (!samePageOrigin) return null;

        const item = getNavItemByHref(url.pathname);
        return item ? { href: item.href, item } : null;
    }

    window.addEventListener("popstate", () => {
        navigateTo(window.location.pathname.split("/").pop() || "Dashboard.html", { replace: true }).catch(error => {
            console.error("History navigation failed:", error);
            showPageError(document.querySelector(".app-main .page-content"), "Unable to restore that page without refreshing.");
        });
    });

    function showPageError(container, message) {
        if (!container) return;
        container.innerHTML = `
            <div class="panel"><p class="muted">${message}</p></div>
        `;
    }

    function pageTitle(page) {
        return {
            Dashboard: "Dashboard Overview",
            AllItems: "All Items",
            Inbox: "Inbox",
            SchoolListings: "School Listings",
            PendingApprovals: "Pending Approvals",
            UserManagement: "User Management",
            FinancialReports: "Financial Reports",
            TransactionHistory: "Transaction History",
            SystemLogs: "System Logs",
            Orders: "Ongoing Orders",
            Categories: "Categories",
            Profile: "Profile"
        }[page] || page;
    }

    function toggleTheme() {
        document.documentElement.classList.toggle("dark");
        localStorage.setItem("theme", document.documentElement.classList.contains("dark") ? "dark" : "light");
        updateThemeIcon();
        if (window.lucide) lucide.createIcons();
    }

    function updateThemeIcon() {
        const icon = document.getElementById("theme-icon");
        if (icon) icon.setAttribute("data-lucide", document.documentElement.classList.contains("dark") ? "sun" : "moon");
    }

    if (localStorage.getItem("theme") === "dark") {
        document.documentElement.classList.add("dark");
    }

    window.AppLayout = {
        renderLayout,
        navigateTo,
        toggleTheme,
        pageTitle
    };
})();
