const fs = require("fs").promises;
const path = require("path");

async function addRepo(filePath) {
  const repoPath = path.resolve(process.cwd(), ".gitMe");
  const stagingPath = path.join(repoPath, "staging");

  try {
    await fs.mkdir(stagingPath, { recursive: true });

    // 1. NEW: Create a list of files to always ignore for security and performance
    const ignoreList = [".gitMe", "node_modules", ".env", ".env.local"];

    // 2. NEW: Try to read the user's .gitignore file and add its contents to the ignore list
    try {
      const gitignorePath = path.join(process.cwd(), ".gitignore");
      const gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
      const gitignoreLines = gitignoreContent
        .split("\n")
        .map((line) => line.trim()) // Remove extra spaces
        .filter((line) => line !== "" && !line.startsWith("#")); // Skip empty lines and comments

      ignoreList.push(...gitignoreLines);
    } catch (err) {
      // If .gitignore doesn't exist, we just quietly catch the error and move on
    }

    if (filePath === ".") {
      const files = await fs.readdir(process.cwd());

      for (const file of files) {
        // 3. CHANGED: Now checks our comprehensive ignoreList before copying
        if (!ignoreList.includes(file)) {
          const stat = await fs.stat(path.join(process.cwd(), file));

          if (stat.isFile()) {
            await fs.copyFile(
              path.join(process.cwd(), file),
              path.join(stagingPath, file),
            );
            console.log(`File ${file} added to the staging area!`);
          }
        }
      }
    } else {
      const fileName = path.basename(filePath);

      // 4. NEW: Prevent manual adding of ignored files (e.g., node index.js add .env)
      if (ignoreList.includes(fileName)) {
        console.log(
          `Error: Cannot add '${fileName}' because it is in your ignore list.`,
        );
        return;
      }

      await fs.copyFile(filePath, path.join(stagingPath, fileName));
      console.log(`File ${fileName} added to the staging area!`);
    }
  } catch (err) {
    console.error("Error adding file : ", err);
  }
}

module.exports = { addRepo };
