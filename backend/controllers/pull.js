const fs = require("fs").promises;
const path = require("path");
const { s3, S3_BUCKET } = require("../config/aws-config");

async function pullRepo() {
  const repoPath = path.resolve(process.cwd(), ".gitMe");
  const commitsPath = path.join(repoPath, "commits");
  const configPath = path.join(repoPath, "config.json");

  try {
    // 1. CHANGED: Read remoteUrl to know which database to talk to
    // FROM: Hardcoding S3 fetches with no knowledge of the specific repository
    // TO: Reading the user's saved config.json
    const configData = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configData);
    const remoteUrl = config.remoteUrl;

    if (!remoteUrl) {
      console.log("fatal: No remote configured.");
      console.log(
        "To pull from the cloud, first run: node index.js remote add <url>",
      );
      return;
    }

    // 2. CHANGED: Fetch repository history from MongoDB instead of guessing from S3
    // We adjust the URL to ensure it hits your standard GET route, assuming remoteUrl was the /update route
    const fetchUrl = remoteUrl.replace("/update", "");
    const response = await fetch(fetchUrl);

    if (!response.ok) {
      console.error("Failed to fetch repository data from server.");
      return;
    }

    const repoData = await response.json();
    const commits = repoData.content;

    if (!commits || commits.length === 0) {
      console.log("Repository is empty. Nothing to pull.");
      return;
    }

    // 3. CHANGED: Loop through the exact commits returned by MongoDB
    // FROM: const data = await s3.listObjectsV2(...)
    // TO: Iterating over our database array to ensure we only get this repo's files
    for (const commit of commits) {
      const commitDir = path.join(commitsPath, commit.commitID);
      await fs.mkdir(commitDir, { recursive: true });

      // We use the nested files array we set up in repoModel.js
      for (const file of commit.files) {
        const params = {
          Bucket: S3_BUCKET,
          Key: `commits/${commit.commitID}/${file.name}`,
        };

        const fileContent = await s3.getObject(params).promise();

        // Save into the local hidden commit snapshot folder
        await fs.writeFile(path.join(commitDir, file.name), fileContent.Body);
      }
    }

    // 4. NEW: Restore the working directory
    // WHY: Pulling files into the hidden .gitMe folder is useless if the user can't see their code!
    // We grab the last commit in the array (the newest one) and copy its files to process.cwd()
    const latestCommit = commits[commits.length - 1];
    const latestCommitDir = path.join(commitsPath, latestCommit.commitID);
    const filesToRestore = await fs.readdir(latestCommitDir);

    for (const file of filesToRestore) {
      await fs.copyFile(
        path.join(latestCommitDir, file),
        path.join(process.cwd(), file),
      );
    }

    console.log(
      "All commits pulled from S3 and working directory updated successfully.",
    );
  } catch (err) {
    console.error("Unable to pull : ", err);
  }
}

module.exports = { pullRepo };
