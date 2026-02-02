import {
  microsoftAccountsGrid,
  offlineAccountsGrid,
  offlineNameInput,
  addOfflineButton,
  microsoftLoginButton,
  offlineWarning,
} from './dom';
import { getInvoke, getListen } from './tauri';
import { setStatus } from './logs';
import { state, resolveAccountKind, slugify } from './state';
import { loadConfig } from './config';

export const renderAccounts = () => {
  const accounts = state.config?.accounts || [];
  const activeId = state.config?.active_account_id || null;

  const renderGrid = (grid: HTMLElement | null, filtered: any[]) => {
    if (!grid) return;
    const staticCard = grid.querySelector('[data-static="true"]');
    grid.querySelectorAll('.account-card').forEach((card) => card.remove());
    if (!filtered.length) {
      return;
    }
    filtered.forEach((account) => {
      const card = document.createElement('article');
      card.className = 'card account-card';
      const header = document.createElement('div');
      header.className = 'card-header';
      const title = document.createElement('h3');
      title.textContent = account.display_name || account.id;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent =
        account.id === activeId ? 'Active' : resolveAccountKind(account.kind);
      header.append(title, tag);

      const body = document.createElement('div');
      body.className = 'card-body';
      const typeRow = document.createElement('div');
      typeRow.className = 'meta-row';
      const typeLabel = document.createElement('span');
      typeLabel.className = 'meta-label';
      typeLabel.textContent = 'Type';
      const typeValue = document.createElement('span');
      typeValue.className = 'meta-value';
      typeValue.textContent = resolveAccountKind(account.kind);
      typeRow.append(typeLabel, typeValue);

      const statusRow = document.createElement('div');
      statusRow.className = 'meta-row';
      const statusLabel = document.createElement('span');
      statusLabel.className = 'meta-label';
      statusLabel.textContent = 'Entitlement';
      const statusValue = document.createElement('span');
      statusValue.className = 'meta-value';
      if (account.kind === 'microsoft') {
        statusValue.textContent =
          account.owns_minecraft === true
            ? 'Owned'
            : account.owns_minecraft === false
              ? 'Not owned'
              : 'Unknown';
      } else {
        statusValue.textContent = 'Offline';
      }
      statusRow.append(statusLabel, statusValue);

      const tokenRow = document.createElement('div');
      tokenRow.className = 'meta-row';
      const tokenLabel = document.createElement('span');
      tokenLabel.className = 'meta-label';
      tokenLabel.textContent = 'Token';
      const tokenValue = document.createElement('span');
      tokenValue.className = 'meta-value';
      if (account.kind === 'microsoft') {
        tokenValue.textContent = account.access_token ? 'Present' : 'Missing';
      } else {
        tokenValue.textContent = '—';
      }
      tokenRow.append(tokenLabel, tokenValue);

      const actions = document.createElement('div');
      actions.className = 'actions-row';
      const setActiveButton = document.createElement('button');
      setActiveButton.className = 'ghost';
      setActiveButton.textContent = 'Set active';
      setActiveButton.setAttribute('data-action', 'account-set-active');
      setActiveButton.setAttribute('data-account-id', account.id);
      const removeButton = document.createElement('button');
      removeButton.className = 'secondary';
      removeButton.textContent = 'Remove';
      removeButton.setAttribute('data-action', 'account-remove');
      removeButton.setAttribute('data-account-id', account.id);
      actions.append(setActiveButton, removeButton);

      if (account.kind === 'microsoft') {
        const refreshButton = document.createElement('button');
        refreshButton.className = 'ghost';
        refreshButton.textContent = 'Refresh token';
        refreshButton.setAttribute('data-action', 'ms-refresh-one');
        refreshButton.setAttribute('data-account-id', account.id);
        const ownershipButton = document.createElement('button');
        ownershipButton.className = 'ghost';
        ownershipButton.textContent = 'Check ownership';
        ownershipButton.setAttribute('data-action', 'ms-check-one');
        ownershipButton.setAttribute('data-account-id', account.id);
        actions.append(refreshButton, ownershipButton);
      }

      body.append(typeRow, statusRow, tokenRow, actions);
      card.append(header, body);

      if (staticCard) {
        grid.insertBefore(card, staticCard);
      } else {
        grid.append(card);
      }
    });
  };

  const microsoft = accounts.filter((account: any) => account.kind === 'microsoft');
  const offline = accounts.filter((account: any) => account.kind === 'offline');
  renderGrid(microsoftAccountsGrid, microsoft);
  renderGrid(offlineAccountsGrid, offline);
  if (offlineWarning) {
    const hasMicrosoft = microsoft.length > 0;
    offlineWarning.setAttribute('aria-hidden', hasMicrosoft ? 'true' : 'false');
  }
};

let accountsBound = false;
export const attachAccountActions = () => {
  if (accountsBound) return;
  accountsBound = true;
  const listen = getListen();
  if (listen) {
    listen('microsoft:code', async (event: any) => {
      const code = event.payload;
      if (!code) return;
      const invoke = getInvoke();
      if (!invoke) {
        setStatus('Tauri backend not available.');
        return;
      }
      try {
        setStatus('Exchanging Microsoft auth code...');
        const account = await invoke('complete_microsoft_login', { code });
        await loadConfig();
        setStatus(`Signed in as ${account?.display_name || 'Microsoft user'}.`);
      } catch (err: any) {
        setStatus(err?.toString?.() || 'Microsoft sign-in failed.');
      }
    });
    listen('microsoft:error', (event: any) => {
      setStatus(event.payload || 'Microsoft sign-in failed.');
    });
  }

  document.addEventListener('click', async (event) => {
    const setActive = event.target.closest?.('button[data-action="account-set-active"]');
    if (setActive) {
      const accountId = setActive.getAttribute('data-account-id');
      if (!accountId || !state.config) return;
      state.config.active_account_id = accountId;
      const invoke = getInvoke();
      if (!invoke) return;
      await invoke('save_config', { config: state.config });
      await loadConfig();
      setStatus('Active account updated.');
      return;
    }

    const removeAccount = event.target.closest?.('button[data-action="account-remove"]');
    if (removeAccount) {
      const accountId = removeAccount.getAttribute('data-account-id');
      if (!accountId || !state.config) return;
      const remaining = (state.config.accounts || []).filter((acc: any) => acc.id !== accountId);
      state.config.accounts = remaining;
      if (state.config.active_account_id === accountId) {
        state.config.active_account_id = remaining[0]?.id || null;
      }
      const invoke = getInvoke();
      if (!invoke) return;
      await invoke('save_config', { config: state.config });
      await loadConfig();
      setStatus('Account removed.');
    }

    const refreshOne = event.target.closest?.('button[data-action="ms-refresh-one"]');
    if (refreshOne) {
      const accountId = refreshOne.getAttribute('data-account-id');
      if (!accountId || !state.config) return;
      const invoke = getInvoke();
      if (!invoke) return;
      try {
        const account = state.config.accounts.find((acc: any) => acc.id === accountId);
        if (account?.refresh_token) {
          await invoke('refresh_microsoft_accounts');
          await loadConfig();
          setStatus('Token refreshed.');
        } else {
          setStatus('No refresh token available for this account.');
        }
      } catch (err: any) {
        setStatus(err?.toString?.() || 'Token refresh failed.');
      }
    }

    const checkOne = event.target.closest?.('button[data-action="ms-check-one"]');
    if (checkOne) {
      const accountId = checkOne.getAttribute('data-account-id');
      if (!accountId) return;
      const invoke = getInvoke();
      if (!invoke) return;
      try {
        await invoke('check_minecraft_ownership', { accountId });
        await loadConfig();
        setStatus('Ownership updated.');
      } catch (err: any) {
        setStatus(err?.toString?.() || 'Ownership check failed.');
      }
    }

    const refreshAll = event.target.closest?.('button[data-action="ms-refresh-all"]');
    if (refreshAll) {
      const invoke = getInvoke();
      if (!invoke) return;
      try {
        await invoke('refresh_microsoft_accounts');
        await loadConfig();
        setStatus('Microsoft tokens refreshed.');
      } catch (err: any) {
        setStatus(err?.toString?.() || 'Token refresh failed.');
      }
    }

    const checkAll = event.target.closest?.('button[data-action="ms-check-entitlements"]');
    if (checkAll) {
      const invoke = getInvoke();
      if (!invoke) return;
      try {
        await invoke('check_minecraft_ownership');
        await loadConfig();
        setStatus('Ownership updated.');
      } catch (err: any) {
        setStatus(err?.toString?.() || 'Ownership check failed.');
      }
    }
  });

  addOfflineButton?.addEventListener('click', async () => {
    const name = offlineNameInput?.value?.trim() || '';
    if (!name || !state.config) {
      setStatus('Enter a display name.');
      return;
    }
    const hasMicrosoft = (state.config.accounts || []).some(
      (account: any) => account.kind === 'microsoft'
    );
    if (!hasMicrosoft) {
      setStatus('Add at least one Microsoft account before creating an offline profile.');
      return;
    }
    const base = slugify(name);
    let candidate = `offline-${base}`;
    let counter = 2;
    const existing = new Set((state.config.accounts || []).map((acc: any) => acc.id));
    while (existing.has(candidate)) {
      candidate = `offline-${base}-${counter}`;
      counter += 1;
    }
    state.config.accounts = [
      ...(state.config.accounts || []),
      {
        id: candidate,
        display_name: name,
        kind: 'offline',
        last_used: null,
      },
    ];
    state.config.active_account_id = candidate;
    const invoke = getInvoke();
    if (!invoke) return;
    await invoke('save_config', { config: state.config });
    if (offlineNameInput) offlineNameInput.value = '';
    await loadConfig();
    setStatus('Offline account added.');
  });

  microsoftLoginButton?.addEventListener('click', async () => {
    const clientId = state.config?.settings?.microsoft_client_id?.trim?.() || '';
    if (!clientId) {
      setStatus('Microsoft login requires a client ID. Set MONOLITH_MS_CLIENT_ID to enable sign-in.');
      return;
    }
    const invoke = getInvoke();
    if (!invoke) {
      setStatus('Tauri backend not available.');
      return;
    }
    try {
      const authorizeUrl = await invoke('start_microsoft_login', { clientId });
      await invoke('open_external', { url: authorizeUrl });
      setStatus('Opening Microsoft sign-in in your browser.');
    } catch (err) {
      setStatus('Unable to open browser for sign-in.');
    }
  });
};
