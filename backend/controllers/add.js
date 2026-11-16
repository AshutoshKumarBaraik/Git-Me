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

    // Helper function to safely copy files OR folders recursively
    async function copyItem(src, dest) {
      const itemName = path.basename(src);

      // Double-check ignore list during recursion (protects inner folders)
      if (ignoreList.includes(itemName)) {
        return;
      }

      const stat = await fs.stat(src);

      if (stat.isDirectory()) {
        await fs.mkdir(dest, { recursive: true });
        const items = await fs.readdir(src);

        for (const item of items) {
          await copyItem(path.join(src, item), path.join(dest, item));
        }
      } else {
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(src, dest);
        console.log(`File ${itemName} added to the staging area!`);
      }
    }

    if (filePath === ".") {
      const files = await fs.readdir(process.cwd());

      for (const file of files) {
        // 3. CHANGED: Now checks our comprehensive ignoreList before copying
        if (!ignoreList.includes(file)) {
          // Call the recursive copy function instead of just copyFile
          await copyItem(
            path.join(process.cwd(), file),
            path.join(stagingPath, file)
          );
        }
      }
    } else {
      const fileName = path.basename(filePath);

      // 4. NEW: Prevent manual adding of ignored files (e.g., node index.js add .env)
      if (ignoreList.includes(fileName)) {
        console.log(
          `Error: Cannot add '${fileName}' because it is in your ignore list.`
        );
        return;
      }

      // Use recursive copyItem to allow adding specific folders like 'node index.js add src'
      await copyItem(filePath, path.join(stagingPath, fileName));
    }
  } catch (err) {
    console.error("Error adding file : ", err);
  }
}

module.exports = { addRepo };