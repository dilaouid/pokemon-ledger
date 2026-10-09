export type IntroStep =
    | { kind: 'text'; text: string; alpaca?: boolean }
    | { kind: 'choice'; text: string; options: readonly [string, string] }
    | { kind: 'branch'; yes: string; no: string; refuse?: boolean }
    | { kind: 'sign'; text: string }
    | { kind: 'loading'; text: string }
    | { kind: 'success'; text: string }
    | { kind: 'error'; id: 'device' | 'refuse'; text: string };

/**
 * Opening beats, in order:
 * texts (alpaca joins some lines), a choice, a reply, a device signature,
 * a loading line, then either a refusal that powers the game off or a seal that continues.
 */
export const INTRO_STEPS: readonly IntroStep[] = [
    { kind: 'text', text: 'HELLO, CANDIDATE.\nI AM ANTHONY.' },
    { kind: 'text', text: 'I AM COIN-INTE.\nMANAGER.' },
    { kind: 'text', text: 'THIS IS ALPACA.\nWELL HE\'S DEAD BUT IT\'S STILL COOL.', alpaca: true },
    { kind: 'text', text: 'ANYWAY WE LOOKS FOR\nOBELIX. HE HAS BEEN KIDNAPPED', alpaca: true },
    { kind: 'choice', text: 'FIRST OF ALL, ARE YOU A BOY OR A GIRL?', options: ['BOY', 'GIRL'] },
    { kind: 'branch', yes: 'WELL, ACTUALLY, IT\'S NOT\nIMPORTANT. ANYWAY...', no: 'WELL, ACTUALLY, IT\'S NOT\nIMPORTANT. ANYWAY...' },
    { kind: 'text', text: 'GAIN SOME NFT TO SAVE MY OBELIX FRIEND.', alpaca: true },
    { kind: 'text', text: 'THAT SOUNDS LIKE\nA SCAM BUT TRUST ME.', alpaca: true },
    { kind: 'choice', text: 'WANNA JOIN THE WORLD OF PO--I MEAN LEDGERMON?', options: ['YES', 'NO'] },
    {
        kind: 'branch',
        yes: 'GOOD. FIRST YOU MUST TELL ME WHO YOU REALLY ARE.',
        no: 'WHAT DO YOU MEAN\"NO"?',
        refuse: true,
    },
    { kind: 'text', text: 'SIGN ON DEVICE.\nENTER OK. ESC NO.' },
    { kind: 'loading', text: 'LOOKING AT YOUR\nWALLET...' },
    { kind: 'success', text: 'MEH.\nLOOKS MID. ' },
    { kind: 'error', id: 'device', text: 'DEVICE REFUSED.\nPOWER OFF.' },
    { kind: 'error', id: 'refuse', text: 'SO WHY DID YOU.\nCAME HERE IN THE FIRST PLACE? SIGN OR LEAVE.' },
];
