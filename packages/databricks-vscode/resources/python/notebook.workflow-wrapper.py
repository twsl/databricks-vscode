# This cell is autogenerated by the Databricks Extension for VS Code
def databricks_preamble():
    from IPython import get_ipython
    from typing import List
    from shlex import quote

    dbutils.widgets.text("DATABRICKS_SOURCE_FILE",
                         "{{DATABRICKS_SOURCE_FILE}}")
    dbutils.widgets.text("DATABRICKS_PROJECT_ROOT",
                         "{{DATABRICKS_PROJECT_ROOT}}")
    src_file_dir = None
    project_root_dir = None

    if dbutils.widgets.get("DATABRICKS_SOURCE_FILE") != "":
        import os
        src_file_dir = os.path.dirname(
            dbutils.widgets.get("DATABRICKS_SOURCE_FILE"))
        os.chdir(src_file_dir)

    if dbutils.widgets.get("DATABRICKS_PROJECT_ROOT") != "":
        import sys
        project_root_dir = dbutils.widgets.get("DATABRICKS_PROJECT_ROOT")
        sys.path.insert(0, project_root_dir)

    def parse_databricks_magic_lines(lines: List[str]):
        if len(lines) == 0 or src_file_dir is None:
            return lines

        first = ""
        for line in lines:
            if len(line.strip()) != 0:
                first = line
                break

        if first.startswith("%"):
            magic = first.split(" ")[0].strip().strip("%")
            rest = ' '.join(first.split(" ")[1:])

            if magic == "sh":
                return [
                    "%sh\n",
                    f"cd {quote(src_file_dir)}\n",
                    rest.strip() + "\n",
                    *lines[1:]
                ]

        return lines

    ip = get_ipython()
    ip.input_transformers_cleanup.append(parse_databricks_magic_lines)


try:
    databricks_preamble()
    del databricks_preamble
except Exception as e:
    print("Error in databricks_preamble: " + str(e))
