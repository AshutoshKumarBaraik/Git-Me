const fs = require("fs").promises;
const path = require("path");
const { s3, S3_BUCKET } = require("../config/aws-config");

// NEW: Helper function to recursively find all files in a folder
async function getAllFiles(dirPath, arrayOfFiles = [], basePath = dirPath) {
  const files = await fs.readdir(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = await fs.stat(fullPath);

    if (stat.isDirectory()) {
      // If it's a folder, search inside it
      arrayOfFiles = await getAllFiles(fullPath, arrayOfFiles, basePath);
    } else {
      // If it's a file, save the absolute path (to read it) and relative path (for S3 key)
      const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');
      arrayOfFiles.push({ absolute: fullPath, relative: relativePath });
    }
  }
  return arrayOfFiles;
}

async function pushRepo() {
  const repoPath = path.resolve(process.cwd(), ".gitMe");
  const commitsPath = path.join(repoPath, "commits");
  const configPath = path.join(repoPath, "config.json");

  try {
    const configData = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configData);

    // 1. CHANGED: Extract remoteUrl instead of repoId
    const remoteUrl = config.remoteUrl;

    // 2. CHANGED: Graceful exit for local-only users
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
      
      // CHANGED: Use recursive helper to get all nested files
      const allFiles = await getAllFiles(commitPath);

      const commitData = {
        commitID: commitDir,
        files: [],
      };

      for (const fileObj of allFiles) {
        // Read file using its absolute path
        const fileContent = await fs.readFile(fileObj.absolute);

        // Use the relative path for S3 and MongoDB
        const s3Key = `commits/${commitDir}/${fileObj.relative}`;
        const params = {
          Bucket: S3_BUCKET,
          Key: s3Key,
          Body: fileContent,
        };

        await s3.upload(params).promise();

        commitData.files.push({
          name: fileObj.relative,
          s3Url: `https://${S3_BUCKET}.s3.amazonaws.com/${s3Key}`,
        });
      }
      pushedCommits.push(commitData);
    }

    console.log("All commits pushed to S3.");

    // 3. CHANGED: Send the PUT request directly to the remote URL
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
      // NEW: Log the exact error message from the server
      const errorText = await response.text();
      console.error(`Failed to update MongoDB. Status: ${response.status}. Reason: ${errorText}`);
    }
  } catch (err) {
    console.error("Error pushing to S3 : ", err);
  }
}

module.exports = { pushRepo };