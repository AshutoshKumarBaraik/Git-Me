const fs = require("fs").promises;
const path = require("path");
const { s3, S3_BUCKET } = require("../config/aws-config");

async function pushRepo() {
  const repoPath = path.resolve(process.cwd(), ".gitMe");
  const commitsPath = path.join(repoPath, "commits");
  const configPath = path.join(repoPath, "config.json");

  try {
    const configData = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configData);

    // 1. CHANGED: Extract remoteUrl instead of repoId
    // FROM:
    // TO: const remoteUrl = config.remoteUrl;
    // WHY: We switched to 'remote add <url>' so end users never have to handle raw database IDs.
    const remoteUrl = config.remoteUrl;

    // 2. CHANGED: Graceful exit for local-only users
    // FROM: if (!repositoryId) { console.error("No repository ID found..."); return; }
    // TO: A standard Git-style message that doesn't treat the lack of a remote as a crash.
    // WHY: This ensures a user can loop 'init', 'add', and 'commit' indefinitely offline without being forced to add a remote.
    if (!remoteUrl) {
      console.log("fatal: No remote configured.");
      console.log(
        "To push to the cloud, first run: node index.js remote add <url>",
      );
      return;
    }

    const commitDirs = await fs.readdir(commitsPath);

    const pushedCommits = [];

    for (const commitDir of commitDirs) {
      const commitPath = path.join(commitsPath, commitDir);
      const files = await fs.readdir(commitPath);

      const commitData = {
        commitID: commitDir,
        files: [],
      };

      for (const file of files) {
        const filePath = path.join(commitPath, file);
        const fileContent = await fs.readFile(filePath);

        const s3Key = `commits/${commitDir}/${file}`;
        const params = {
          Bucket: S3_BUCKET,
          Key: s3Key,
          Body: fileContent,
        };

        await s3.upload(params).promise();

        commitData.files.push({
          name: file,
          s3Url: `https://${S3_BUCKET}.s3.amazonaws.com/${s3Key}`,
        });
      }
      pushedCommits.push(commitData);
    }

    console.log("All commits pushed to S3.");

    // 3. CHANGED: Send the PUT request directly to the remote URL
    // FROM: fetch(`http://localhost:3000/repo/update/${repositoryId}`, { ... })
    // TO: fetch(remoteUrl, { ... })
    // WHY: The CLI now dynamically sends the update to exactly where the user pointed it during the 'remote add' command.
    const response = await fetch(remoteUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: pushedCommits,
        description: "Updated via CLI push",
      }),
    });

    if (response.ok) {
      console.log(
        "MongoDB updated successfully! React can now see your files.",
      );
    } else {
      console.error("Failed to update MongoDB.");
    }
  } catch (err) {
    console.error("Error pushing to S3 : ", err);
  }
}

module.exports = { pushRepo };
