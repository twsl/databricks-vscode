import {compute} from "@databricks/sdk-experimental";

/**
 * Supported Databricks notebook magic commands.
 * @see https://docs.databricks.com/aws/en/notebooks/notebooks-code#use-magic-commands
 */
export type NotebookMagic =
    | "sql"
    | "python"
    | "scala"
    | "r"
    | "md"
    | "md-sandbox" // Deprecated/undocumented but still supported for backward compatibility
    | "sh"
    | "fs"
    | "pip"
    | "run"
    | "tensorboard"
    | "set_cell_max_output_size_in_mb"
    | "skip"
    | "profile" // %%profile cell magic (DBR 17.2+)
    | "oprofile"; // %%oprofile cell magic (DBR 17.2+)

export interface ParsedCell {
    language: compute.Language;
    commandText: string;
    magic: NotebookMagic | undefined;
}

const LANGUAGE_MAGICS = new Set<string>(["python", "sql", "scala", "r"]);

/**
 * Built-in IPython magic commands available in Databricks notebooks.
 * Databricks has IPython automagic enabled by default, so these can be
 * used without the % prefix (e.g. `pip install pandas` == `%pip install pandas`).
 *
 * Line magics (%):
 *   %alias, %alias_magic, %autocall, %automagic, %bookmark, %cd, %colors,
 *   %config, %debug, %dhist, %dirs, %doctest_mode, %edit, %env, %gui,
 *   %history, %killbgscripts, %load, %load_ext, %loadpy, %logoff, %logon,
 *   %logstart, %logstate, %logstop, %lsmagic, %macro, %magic, %matplotlib,
 *   %notebook, %page, %pastebin, %pdb, %pdef, %pdoc, %pfile, %pinfo,
 *   %pinfo2, %popd, %pprint, %precision, %profile, %prun, %psearch,
 *   %psource, %pushd, %pwd, %pycat, %pylab, %quickref, %recall, %rehashx,
 *   %reload_ext, %rerun, %reset, %reset_selective, %run, %save, %sc,
 *   %set_env, %sx, %system, %tb, %time, %timeit, %unalias, %unload_ext,
 *   %who, %who_ls, %whos, %xdel, %xmode
 *
 * Cell magics (%%):
 *   %%bash, %%capture, %%html, %%javascript, %%js, %%latex, %%perl, %%pypy,
 *   %%python, %%python2, %%python3, %%ruby, %%script, %%sh, %%svg, %%writefile
 *
 * @see https://ipython.readthedocs.io/en/stable/interactive/magics.html
 */

/**
 * Databricks notebook magic commands that should be recognized without the %
 * prefix via IPython automagic. These are set as {@link NotebookMagic} so the
 * controller can handle them (e.g. show "unsupported" or skip execution).
 */
const AUTOMAGIC_NOTEBOOK_COMMANDS = new Set<string>([
    "pip",
    "sh",
    "fs",
    "run",
    "skip",
    "tensorboard",
    "set_cell_max_output_size_in_mb",
]);

/**
 * Common IPython line magics that should be recognized without the % prefix.
 * These are prepended with % and sent to the kernel as-is (no special
 * controller handling needed).
 * @see https://ipython.readthedocs.io/en/stable/interactive/magics.html
 */
const AUTOMAGIC_IPYTHON_COMMANDS = new Set<string>([
    "env",
    "set_env",
    "who",
    "whos",
    "who_ls",
    "pwd",
    "cd",
    "history",
    "matplotlib",
    "lsmagic",
    "time",
    "timeit",
    "prun",
    "debug",
    "pdb",
    "reset",
    "load_ext",
    "pylab",
]);

export function parseCellMagic(
    cellText: string,
    defaultLanguage: compute.Language = "python"
): ParsedCell {
    let language: compute.Language = defaultLanguage;
    let commandText = cellText;
    let magic: NotebookMagic | undefined;

    if (cellText.startsWith("%")) {
        const lines = cellText.split("\n");
        const firstToken = lines[0].split(" ")[0];
        // Handle both %magic and %%magic prefixes
        const magicText = firstToken.replace(/^%+/, "");

        if (LANGUAGE_MAGICS.has(magicText)) {
            language = magicText as compute.Language;
            magic = magicText as NotebookMagic;
            commandText = lines.slice(1).join("\n");
        } else if (
            [
                "md",
                "md-sandbox",
                "sh",
                "fs",
                "pip",
                "run",
                "tensorboard",
                "set_cell_max_output_size_in_mb",
                "skip",
                "profile",
                "oprofile",
            ].includes(magicText)
        ) {
            magic = magicText as NotebookMagic;
            if (magic === "pip") {
                language = "python";
                // Keep the full command text including %pip for pip magics
                commandText = cellText;
            } else if (magic === "run") {
                commandText = lines
                    .slice(0)
                    .join("\n")
                    .substring(lines[0].indexOf(" ") + 1)
                    .trim();
            } else if (
                magic === "tensorboard" ||
                magic === "set_cell_max_output_size_in_mb"
            ) {
                // Keep full command text including the magic for remote execution
                commandText = cellText;
            } else if (magic === "skip") {
                // No command text needed — cell should not execute
                commandText = "";
            } else if (magic === "profile" || magic === "oprofile") {
                // %%profile / %%oprofile: cell body is the code to profile
                commandText = cellText;
            } else {
                commandText = lines.slice(1).join("\n");
            }
        }
    } else {
        // IPython automagic: commands like `pip install pandas` work without %
        // @see https://ipython.readthedocs.io/en/stable/interactive/magics.html
        const firstWord = cellText.split(/\s/)[0];
        if (AUTOMAGIC_NOTEBOOK_COMMANDS.has(firstWord)) {
            magic = firstWord as NotebookMagic;
            language = "python";
            // Rewrite to canonical %magic form for execution
            commandText = "%" + cellText;
        } else if (AUTOMAGIC_IPYTHON_COMMANDS.has(firstWord)) {
            // Standard IPython magic — prepend % for kernel execution
            commandText = "%" + cellText;
        }
    }

    return {language, commandText, magic};
}
