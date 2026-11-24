/**
 * Which opening an objective has, tied to the instruction file it names (by sha256), never to a date.
 *
 * Every instruction file published before the site was called Swarmpedia was sent with the older openings:
 * "Write the record page for one subject: <subject description>. " and "Judge a visitor's proposed changes to the
 * record of one subject: <subject description>. " (templates/rebuild-v1.txt, templates/changes-v1.txt). Every file
 * published since is sent with "<Write|Rebuild> the Swarmpedia page for <subject id>. " and "Check changes to the
 * Swarmpedia page for <subject id>. ", the main contract in its own sentence (templates/rebuild.txt, changes.txt).
 * This list never changes: a new instruction file is not in it, so it takes the current openings.
 */
export const V1_OPENING_HASHES: ReadonlySet<string> = new Set([
  "053f706852a0a90b8a94a83256f2348703406b3b87bf0573a2b875f9e94933a8",
  "0571b29e932dffdc535a03b550ec0f1ee39ef111fc4f6a3e61b8badec0e8712f",
  "059436ca0814e6ed82e77ac9a41ecf5b85d4276495226e61e7d669fab68234dc",
  "275c3c26682cfea8d301c7cb9460728bf5a0c91576f8b78755e8751010dfec31",
  "74f6ac6095c4bfc35e704a99aa256e19e60045673d799285ea7fa2631b080602",
  "8400e6bf9d85d62ec6f7285e35e328353f499dd7e93101a6d311b24bf6fab3a7",
  "96e6afd8f00d4baf718be340fe761c9f905c300dfe0ebebb32cdb34cb8c34aeb",
  "b1e42e455312eea78f4772b56e10fdc56f0298acae0359c980a301dcf091c6b6",
  "c7a1725279f5bc83836f52382049c59f6078ea5961ebd660f58b4a584826a381",
  "cbb133e479cabaa8f4ab40c0bc38b6e18964ee0baf0776f657ff39b8585e9e36",
  "e469ba6f33e4d2b1dc708ec0bf01b6aa3739dded1710142dc00f9fc97b29f2ae",
  "153b2cd5869bdb6853081cf4f2dbff02f933284d3cc46708f4c9fccd28a19fe8",
  "323385aa01ae67564661a7a1dc4ad91bab1d28ed6a647dd0a177b09438842ad1",
  "5c84552b327e819edc35a6f19b7785cbb345076e1875c8411649daaa8ed54e33",
  "77f7165b205191d195107af3bbd2d149449c33ed53b2a7135374b2e1573d4aab",
  "8ba8632e27f27a9d9baffe305bd482456ebe8c1ddca08f311db79d843d13ab42",
  "8d7dfbc27d0726030278feb139a678bab961560608edbe598ba2ece8fd1b2132",
  "936893c77936300d26031d667959ed61773d825194a407efc5a3e666222742b6",
  "a81f2fe15b9f043984a4386cdd4e28327666a7811fe6bb2ae9c390891b79dac6",
  "aede2eb3673711daae1435f157c0925a9dd47dc6402204c8bac6eddefc8dfb23",
  "b280294bd61bd23489b5f18ce8962589e184e6ae868215c8d7125e7d0c3d7933",
  "b6493be791323f3c6cee462a296fb6ed6da4740112f1195f5ec8dbfccebc0fce",
  "bb2a3c8834d1d71d16acacc81c209f3d0cff54ea9044331eff8001696c003635",
  "ede1a5e23b01cacb11c10174146b2523ec05effe5ef108e8fbbb22e8a5dbc823",
]);

/** True when a job naming this instruction file was written with the older openings. */
export const hasV1Opening = (sha256: string) => V1_OPENING_HASHES.has(sha256);
