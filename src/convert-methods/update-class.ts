import { existsSync, readFileSync } from "fs";
import { getPackageImport } from "../utils/get-package-import";
import { getClasses, EntityType, DartClass } from "../utils/dart";
import { getHiveTypesTemplate } from "../templates/hive-types";
import { getUpdatedHiveTypesFile } from "../utils/get-updated-hive-types-file";
import { getHiveAdapterTemplate } from "../templates/hive-adapters";
import { getUpdatedHiveAdapterFile } from "../utils/get-updated-hive-adapters-file";
import { setFileData } from "../utils/set-file-data";
import * as changeCase from "change-case";

export async function updateClass(
  classes: Array<DartClass>,
  targetPath: string,
  hiveHelperDirectory: string,
  extendHiveObject: boolean
) {
  let fileContents = "";
  let originalFile = classes[0].fileContents;
  const hiveImport = "import 'package:hive/hive.dart';\n";

  for (let i = 0; i < classes.length; i++) {
    const hiveClass = classes[i];
    let convertedClass: Array<string> = [];
    let imports: string = "";
    let classSnakeCasedName = changeCase.snakeCase(hiveClass.className);
    let classCamelCasedName = changeCase.camelCase(hiveClass.className);

    if (
      originalFile.indexOf(hiveImport) < 0 &&
      fileContents.indexOf(hiveImport) < 0 &&
      imports.indexOf(hiveImport) < 0
    ) {
      imports += hiveImport;
    }

    //get hive type string
    const hiveTypesPath = `${hiveHelperDirectory}/hive_types.dart`;
    const hiveTypesImportString = `${getPackageImport(hiveTypesPath)}\n`;

    const hiveTypeString = `@HiveType(typeId: HiveTypes.${classCamelCasedName}, adapterName: HiveAdapters.${classCamelCasedName})\n`;

    //get hive type string
    const hiveAdapterPath = `${hiveHelperDirectory}/hive_adapters.dart`;
    const hiveAdapterImportString = `${getPackageImport(hiveAdapterPath)}\n`;

    //get file name
    const targetPathSplit = targetPath.split("/");
    const targetFileName = targetPathSplit[
      targetPathSplit.length - 1
    ].substring(0, targetPathSplit[targetPathSplit.length - 1].length - 5);

    const hivePartString = `part '${targetFileName}.g.dart';`;

    // setting hive type
    let dataToSet: string;
    if (!existsSync(hiveTypesPath)) {
      dataToSet = getHiveTypesTemplate(hiveClass.className);
      await setFileData(hiveTypesPath, dataToSet);
    } else {
      let hiveTypesFile = readFileSync(hiveTypesPath, "utf8");
      const existingHiveClass = await getClasses(hiveTypesFile);

      dataToSet = getUpdatedHiveTypesFile(
        hiveTypesFile,
        hiveClass.className,
        // there will always only be one
        existingHiveClass[0]
      );

      await setFileData(hiveTypesPath, dataToSet);
    }

    //setting hive adapters
    dataToSet = "";
    if (!existsSync(hiveAdapterPath)) {
      dataToSet = getHiveAdapterTemplate(hiveClass.className);
      await setFileData(hiveAdapterPath, dataToSet);
    } else {
      let hiveAdapterFile = readFileSync(hiveAdapterPath, "utf8");
      const existingHiveClass = await getClasses(hiveAdapterFile);

      dataToSet = getUpdatedHiveAdapterFile(
        hiveAdapterFile,
        hiveClass.className,
        // there will always only be one
        existingHiveClass[0]
      );

      await setFileData(hiveAdapterPath, dataToSet);
    }

    // adding type import
    if (
      originalFile.indexOf(hiveTypesImportString) < 0 &&
      fileContents.indexOf(hiveTypesImportString) < 0 &&
      imports.indexOf(hiveTypesImportString) < 0
    ) {
      imports += hiveTypesImportString;
    }

    //adding adapter import
    if (
      originalFile.indexOf(hiveAdapterImportString) < 0 &&
      fileContents.indexOf(hiveAdapterImportString) < 0 &&
      imports.indexOf(hiveAdapterImportString) < 0
    ) {
      imports += hiveAdapterImportString;
    }

    for (let i = 0; i < hiveClass.lines.length; i++) {
      const line = hiveClass.lines[i];
      //defaulted to nothing
      let hiveFieldString = "";
      const hiveFieldImport = `{${hiveHelperDirectory}/fields/${classSnakeCasedName}_fields.dart`;
      const hiveFieldImportString = `${getPackageImport(hiveFieldImport)}\n`;

      if (line.entityType === EntityType.InstanceVariable) {
        let lineSplit = line.line.split(" ");
        let fieldName = lineSplit[lineSplit.length - 1];
        fieldName = fieldName.substring(0, fieldName.length - 1);
        hiveFieldString = `\t@HiveField(${hiveClass.className}Fields.${fieldName})\n`;
      }
      convertedClass.push(`${hiveFieldString}${line.line}`);

      if (
        originalFile.indexOf(hiveFieldImportString) < 0 &&
        fileContents.indexOf(hiveFieldImportString) < 0 &&
        imports.indexOf(hiveFieldImportString) < 0
      ) {
        imports += hiveFieldImportString;
      }
    }

    let convertedClassString = convertedClass.join("\n");
    let beginningString = originalFile.substring(0, hiveClass.classOffset);
    const beginningStringSplit = beginningString.split("\n");

    //optimize so that it doesn't have to run every time
    for (var x = 0; x < beginningStringSplit.length; x++) {
      if (beginningStringSplit[x] === "") {
        beginningStringSplit.splice(x, 1);
      }
      if (beginningStringSplit[x].includes(hivePartString)) {
        beginningStringSplit.splice(x, 1);
      }
      if (beginningStringSplit[x].includes("@Hive")) {
        beginningStringSplit.splice(x, 1);
      }
    }
    imports += beginningStringSplit.join("\n");

    let classString = `class ${hiveClass.className} ${
      extendHiveObject ? "extends HiveObject " : ""
    }`;
    let endString = originalFile.substring(hiveClass.closeCurlyOffset + 1);

    // imports += "\n\n";

    if (i > 0) {
      fileContents +=
        "\n\n" +
        hiveTypeString +
        classString +
        convertedClassString +
        endString;
    } else {
      fileContents +=
        imports +
        hivePartString +
        "\n\n" +
        hiveTypeString +
        classString +
        convertedClassString;
    }
  }

  await setFileData(targetPath, fileContents);
}