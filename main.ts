import {
	Plugin,
	TFile,
	Notice,
	TAbstractFile,
	FileSystemAdapter,
} from "obsidian";
import { exec } from "child_process";
import * as path from "path";
import { promises as fs } from "fs";

export default class JupytextPlugin extends Plugin {
	async onload() {
		// Command to create a Jupyter Notebook from the current note
		this.addCommand({
			id: "create-jupyter-notebook",
			name: "Create Jupyter notebook from note",
			callback: () => this.createNotebook(),
		});

		// Command to open the paired Jupyter Notebook in VS Code
		this.addCommand({
			id: "open-jupyter-notebook-in-vscode",
			name: "Open Jupyter notebook in VS Code",
			callback: () => this.openNotebookInEditor("vscode"),
		});

		// Command to open the paired Jupyter Notebook in Jupyter Lab
		this.addCommand({
			id: "open-jupyter-notebook-in-lab",
			name: "Open Jupyter notebook in Jupyter Lab",
			callback: () => this.openNotebookInEditor("jupyter-lab"),
		});

		// Watch for file changes and sync
		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) =>
				this.syncFiles(file)
			)
		);
	}

	// Get the absolute path of a file in the vault
	getAbsolutePath(file: TFile): string {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			const vaultPath = adapter.getBasePath();
			return path.join(vaultPath, file.path);
		} else {
			throw new Error("Cannot get base path: unsupported adapter type.");
		}
	}

	// Check if the Markdown file is paired with a Jupyter Notebook
	async isNotebookPaired(file: TFile): Promise<boolean> {
		const mdPath = this.getAbsolutePath(file);
		const ipynbPath = mdPath.replace(/\.md$/, ".ipynb");

		try {
			await fs.access(ipynbPath, fs.constants.F_OK);
			return true;
		} catch (error) {
			return false;
		}
	}

	// Command to create a Jupyter Notebook from the active note
	async createNotebook() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note found.");
			return;
		}

		const mdPath = this.getAbsolutePath(activeFile);
		const ipynbPath = mdPath.replace(/\.md$/, ".ipynb");

		// Check if the notebook is already paired
		if (await this.isNotebookPaired(activeFile)) {
			new Notice("Notebook is already paired with this note.");
			return;
		}

		exec(`jupytext --to notebook "${mdPath}"`, (error) => {
			if (error) {
				new Notice(`Failed to create notebook: ${error.message}`);
				return;
			}

			exec(`jupytext --set-formats ipynb,md "${ipynbPath}"`, (error) => {
				if (error) {
					new Notice(`Failed to pair notebook: ${error.message}`);
					return;
				}

				new Notice(`Notebook created and paired: ${ipynbPath}`);
			});
		});
	}

	// Command to open the paired Jupyter Notebook in editor
	async openNotebookInEditor(editor: "vscode" | "jupyter-lab") {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note found.");
			return;
		}

		// Check if the notebook is paired
		if (!(await this.isNotebookPaired(activeFile))) {
			new Notice("No paired Jupyter Notebook found for this note.");
			return;
		}

		const mdPath = this.getAbsolutePath(activeFile);
		const ipynbPath = mdPath.replace(/\.md$/, ".ipynb");

		let command: string;
		let editorName: string;

		switch (editor) {
			case "vscode":
				command = `code "${ipynbPath}"`;
				editorName = "VS Code"
				break;
			case "jupyter-lab":
				command = `python -m jupyterlab "${ipynbPath}"`;
				editorName = "Jupyter Lab"
				break;
			default:
				throw new Error(`Unsupported editor: ${editor}`);
		}

		// Open the .ipynb file in editor
		exec(command, (error) => {
			if (error) {
				new Notice(
					`Failed to open notebook in ${editorName}: ${error.message}`
				);
				return;
			}
			new Notice(`Opened notebook in ${editorName}: ${ipynbPath}`);
		});
	}

	// Sync files when either the Markdown or Jupyter Notebook is modified
	async syncFiles(file: TAbstractFile) {
		if (!(file instanceof TFile)) {
			return;
		}

		const filePath = this.getAbsolutePath(file);

		if (filePath.endsWith(".md")) {
			const ipynbPath = filePath.replace(/\.md$/, ".ipynb");
			exec(`jupytext --sync "${ipynbPath}"`, (error) => {
				if (error) {
					console.error(
						`Failed to sync Markdown file: ${error.message}`
					);
				}
			});
		} else if (filePath.endsWith(".ipynb")) {
			const mdPath = filePath.replace(/\.ipynb$/, ".md");
			exec(`jupytext --sync "${mdPath}"`, (error) => {
				if (error) {
					console.error(
						`Failed to sync Jupyter Notebook: ${error.message}`
					);
				}
			});
		}
	}
}
