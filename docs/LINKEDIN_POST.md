# LinkedIn Post: Storm Fund at Sheridan Datathon 2026

This past weekend I took part in Sheridan Datathon 2026, a Major League Hacking event, and won the Best Use of Solana award. My build ran in the Tangerine track, Resilience Rewired.

I built Storm Fund, a resilience weather station for bank customers. It takes an anonymized bank dataset (4,500 accounts, 1.06 million transactions from the Tangerine track) and shows each account's financial weather: runway in months, buffer, and a verdict band. Inject a shock (job loss with EI at 55 percent, bills up 15 percent, a furnace repair) and the forecast changes live. The biggest finding: at baseline 1 percent of accounts (60 of 4,500) sit under three months of runway, and the laid off twist jumps it to 10 percent (435 of 4,500). It also prints a plan: an emergency fund goal and a backup lever ladder. The site is a static bundle with no server, so it runs with the booth wifi off.

What Solana is: a fast, low cost Layer 1 blockchain for high throughput and cheap transactions, popular for payments and finance apps. I used its devnet, a test network with fake SOL and no real money.

Three memo transactions on devnet anchor SHA256 digests (hashes) of the frozen results: the findings file root, the model card hash, and an aggregate fingerprint. Aggregates only, no raw customer data ever touches the chain. That makes the analysis tamper-evident: anyone can run shasum on the repo files and compare to the Solana explorer link to prove the numbers shown to judges were the numbers I computed. The receipt badge on screen renders from bundled evidence files with zero runtime network calls. No wallet, no tokens, no real money.

In its current state, Storm Fund is a static demo on devnet with precomputed data. Next steps are deeper integration: attestations computed live as the analysis runs.

I think this is where the field goes: fintech products live or die on trust, and blockchain is the natural home for provenance, audit trails, and attestations that do not depend on trusting the bank or vendor. Concrete next step: on chain attestations of financial analysis, and behavioral or credit scores attested on chain that could gate a credit line or automate surplus sweeps. The F3 model behind the current score has AUC 0.590, which is not strong enough to gate credit yet, so that is future work.

What would you want proven before you trusted a financial forecast?

(Attach native demo video (https://youtu.be/1mc1r3SXIkU))
