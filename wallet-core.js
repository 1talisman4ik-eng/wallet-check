// Чистая логика проверки кошелька Solana (только чтение, без ключей и подписей).
// Работает и в браузере (window.WalletCore), и в Node (module.exports) для тестов.
(function (root) {
  'use strict';

  var LAMPORTS_PER_SOL = 1e9;
  var TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  var TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
  // Base58 без 0, O, I, l; публичный ключ Solana = 32-44 символа
  var ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  function isValidAddress(addr) {
    return typeof addr === 'string' && ADDRESS_RE.test(addr.trim());
  }

  function lamportsToSol(lamports) {
    return lamports / LAMPORTS_PER_SOL;
  }

  // accounts: массив value[] из getTokenAccountsByOwner (encoding: jsonParsed)
  // Пустой аккаунт = баланс токена ровно 0. Сумма к возврату берётся из
  // реального поля account.lamports (рента), а не из предположения о размере.
  function analyzeTokenAccounts(accounts) {
    var total = accounts.length;
    var empty = [];
    var reclaimableLamports = 0;
    for (var i = 0; i < accounts.length; i++) {
      var a = accounts[i];
      var info = a && a.account && a.account.data && a.account.data.parsed && a.account.data.parsed.info;
      if (!info || !info.tokenAmount) continue;
      var isEmpty = String(info.tokenAmount.amount) === '0';
      var frozen = info.state === 'frozen';
      // замороженный аккаунт закрыть нельзя
      if (isEmpty && !frozen) {
        reclaimableLamports += a.account.lamports;
        empty.push({
          pubkey: a.pubkey,
          mint: info.mint,
          lamports: a.account.lamports,
          program: a.account.owner
        });
      }
    }
    return {
      totalTokenAccounts: total,
      emptyCount: empty.length,
      reclaimableLamports: reclaimableLamports,
      reclaimableSol: lamportsToSol(reclaimableLamports),
      empty: empty
    };
  }

  function rpcBody(id, method, params) {
    return JSON.stringify({ jsonrpc: '2.0', id: id, method: method, params: params });
  }

  async function rpc(fetchFn, url, method, params) {
    var res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rpcBody(1, method, params)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var json = await res.json();
    if (json.error) throw new Error(json.error.message || 'RPC error');
    return json.result;
  }

  async function checkWallet(fetchFn, url, address) {
    address = address.trim();
    if (!isValidAddress(address)) throw new Error('INVALID_ADDRESS');
    var balance = await rpc(fetchFn, url, 'getBalance', [address]);
    var progs = [TOKEN_PROGRAM, TOKEN_2022_PROGRAM];
    var all = [];
    for (var i = 0; i < progs.length; i++) {
      var r = await rpc(fetchFn, url, 'getTokenAccountsByOwner', [
        address,
        { programId: progs[i] },
        { encoding: 'jsonParsed' }
      ]);
      all = all.concat(r.value || []);
    }
    var analysis = analyzeTokenAccounts(all);
    analysis.address = address;
    analysis.solBalance = lamportsToSol(balance.value);
    return analysis;
  }

  var api = {
    isValidAddress: isValidAddress,
    lamportsToSol: lamportsToSol,
    analyzeTokenAccounts: analyzeTokenAccounts,
    checkWallet: checkWallet,
    TOKEN_PROGRAM: TOKEN_PROGRAM,
    TOKEN_2022_PROGRAM: TOKEN_2022_PROGRAM
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WalletCore = api;
})(typeof self !== 'undefined' ? self : this);
