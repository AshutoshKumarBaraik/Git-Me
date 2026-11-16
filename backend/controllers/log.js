const fs = require("fs").promises;
const path = require("path");

async function showLogs() {
  const repoPath = path.resolve(process.cwd(), ".gitMe");
  const commitsPath = path.join(repoPath, "commits");

  try {
    // Check if the commits folder exists
    try {
      await fs.access(commitsPath);
    } catch {
      console.log("No commits found. (Have you run 'init' and 'commit'?)");
      return;
    }

    const commitDirs = await fs.readdir(commitsPath);

    if (commitDirs.length === 0) {
      console.log("No commits found.");
      return;
    }

    console.log("\n--- gitMe Commit History ---\n");

    // Loop through each commit folder and read the commit.json
    for (const commitID of commitDirs) {
      const commitJsonPath = path.join(commitsPath, commitID, "commit.json");
      
      try {
        const commitData = await fs.readFile(commitJsonPath, "utf-8");
        const parsedData = JSON.parse(commitData);
        
        // Print the commit details in a clean format
        console.log(`Commit ID : ${commitID}`);
        console.log(`Date      : ${new Date(parsedData.date).toLocaleString()}`);
        console.log(`Message   : ${parsedData.message}`);
        console.log("--------------------------------------------------");
      } catch (err) {
        // Skip folders that somehow don't have a commit.json
      }
    }
  } catch (err) {
    console.error("Error reading logs: ", err);
  }
}

module.exports = { showLogs };