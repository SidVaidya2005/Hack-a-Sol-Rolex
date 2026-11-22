// snarkjs 0.7.6 leaves some files open, such as the ptau in zKey.verifyFromR1cs.
// Node 26 crashes if garbage collection reaches an open FileHandle, so keep a
// reference to each one until it closes. The handles are released at process exit.
import fs from "node:fs";

const openHandles = new Set();
const open = fs.promises.open.bind(fs.promises);

fs.promises.open = async (...args) => {
  const handle = await open(...args);
  openHandles.add(handle);
  handle.once("close", () => openHandles.delete(handle));
  return handle;
};
