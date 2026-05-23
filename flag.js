const flag = process.env.FLAG || 'SHERLOCK{m0r1arty_p01s0n3d_th3_b4k3r_str33t_c4ch3}';

const archiveSession = process.env.ARCHIVE_SESSION || 'REICHENBACH-ADMIN-SESSION-221B';

function getFlag() {
  return flag;
}

function getArchiveSession() {
  return archiveSession;
}

module.exports = {
  getFlag,
  getArchiveSession
};
