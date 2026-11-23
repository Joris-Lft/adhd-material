import { z } from "zod";

// CSP sans `unsafe-eval` : zod sonde `new Function` à la création de chaque schéma (violation signalée
// en console). Le réglage doit donc précéder le premier schéma : tout le code importe `z` d'ici, jamais de "zod".
z.config({ jitless: true });

export { z };
