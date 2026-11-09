# LinkedIn Post: Storm Fund at Sheridan Datathon 2026

This past weekend I took part in Sheridan Datathon 2026, a Major League Hacking event, and won the Best Use of Solana award.

I built Storm Fund, a resilience weather forecast for bank customers. It takes an anonymized bank dataset (4,500 accounts, 1.06 million transactions from Tangerine) and shows each account's financial weather: runway in months, buffer, and an account status stated as a weather warning. Simulate a shock event (job loss with EI at 55 percent, bills up 15 percent, a furnace repair) and the forecast changes live. Using this data, we can build an emergency fund plan to better prepare for a rainy day.

Solana is a fast, low cost Layer 1 blockchain for high throughput and cheap transactions, popular for payments and finance apps. I used its devnet, a test network with fake SOL and no real money.

Three transactions on Solana devnet store hashes of our results, so anyone can verify the numbers were not changed after judging. The receipt badge on screen reads those hashes from bundled files, with no network calls.

It was fun experimenting with financial data and blockchain platforms despite coming from a mechanical engineering background.

I think this is where the field goes: fintech products live or die on trust, and blockchain is the natural home for provenance, audit trails, and attestations that do not depend on trusting the bank or vendor. Concrete next step: on chain attestations of financial analysis, and behavioral or credit scores attested on chain that could gate a credit line or automate surplus sweeps. The F3 model behind the current score has AUC 0.590, which is not strong enough to gate credit yet, so that is future work.

What would you want proven before you trusted a financial forecast?

(Attach native demo video (https://youtu.be/1mc1r3SXIkU))
