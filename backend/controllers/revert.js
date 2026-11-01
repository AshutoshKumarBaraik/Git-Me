const fs = require("fs").promises;
const path = require("path");

async function revertRepo(commitID) {
  const repoPath = path.resolve(process.cwd(), ".gitMe");
  const commitsPath = path.join(repoPath, "commits");

  try {
    const commitDir = path.join(commitsPath, commitID);

    // 1. CHANGED: Switched to fs.promises
    // FROM: const readdir = promisify(fs.readdir);
    // TO: Native fs.promises.readdir
    // WHY: Keeps this file consistent with your push, pull, and commit scripts so you don't have mixed syntax across your app.
    const files = await fs.readdir(commitDir);

    // 2. CHANGED: Use process.cwd() directly
    // FROM: const parentDir = path.resolve(repoPath, "..");
    // TO: const parentDir = process.cwd();
    // WHY: It is more readable and guarantees we are targeting the exact directory the user ran the command from.
    const parentDir = process.cwd();

    for (const file of files) {
      // 3. CHANGED: Ignore the commit.json metadata file
      // FROM: blindly copying every file in the commit folder
      // TO: Checking if the file is "commit.json" before copying
      // WHY: In your commit.js, you save a 'commit.json' file alongside the code files to track the date and message. We do not want to accidentally leak that hidden metadata file into the user's main project workspace!
      if (file !== "commit.json") {
        await fs.copyFile(
          path.join(commitDir, file),
          path.join(parentDir, file),
        );
      }
    }

    console.log(`Commit ${commitID} reverted successfully!`);
  } catch (err) {
    console.error("Unable to revert : ", err);
  }
}

module.exports = { revertRepo };
