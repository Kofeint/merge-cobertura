import { ParsedArgs } from 'minimist';
import { X2jOptions, XMLParser } from 'fast-xml-parser';
import { CoberturaJson } from './types/cobertura';
import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

interface PackageJson {
  version: string;
}

function printHelp() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../package.json')).toString('utf-8')
  ) as PackageJson;

  console.log(`Version ${packageJson.version}`);
  console.log('Syntax:    merge-cobertura [options]... [package=input...]');
  console.log('           merge-cobertura [options]... input-files...');
  console.log('');
  console.log('Examples:  merge-cobertura -o output.xml package1=output1.xml package2=output2.xml');
  console.log('           merge-cobertura -o output.xml coverage/*.xml');
  console.log('           merge-cobertura -p package1=output1.xml package2=output2.xml');
  console.log('');
  console.log('Options');
  console.log('-o FILE         Specify output file');
  console.log('-p, --print     print coverage report summary');
  process.exit();
}

const KNOWN_ARGS = ['_', 'o', 'p', 'print'];

// initialize XMLParser
const options: X2jOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '',
  ignoreDeclaration: true,
  textNodeName: '$t',
  alwaysCreateTextNode: true,
  isArray: (name, _jpath, _isLeafNode, isAttribute) => { 
    return !isAttribute && name !== 'coverage'
  }
};

const parser = new XMLParser(options);

export function validateArgs(args: ParsedArgs): void {
  // Check for unknown arguments
  const unknownArg = Object.keys(args).find((arg) => KNOWN_ARGS.indexOf(arg) === -1);
  if (unknownArg) {
    console.log(`Unknown argument ${unknownArg}\n`);
    printHelp();
    process.exit(1);
  }

  if (args._.length < 3 || args.o === true || Array.isArray(args.o) || typeof args.p === 'string' || Array.isArray(args.p)) {
    // Input error
    printHelp();
  }
}

export interface InputData {
  packageName: string;
  fileName: string;
  data: CoberturaJson;
}

function expandGlobs(filePatterns: string[]): string[] {
  const result: string[] = [];
  for (const pattern of filePatterns) {
    const files = glob.sync(pattern);
    if (files.length === 0) {
      console.warn(`Warning: No files found matching pattern '${pattern}'`);
    }
    result.push(...files);
  }
  return result;
}

export function getInputDataFromArgs(args: ParsedArgs): InputData[] {
  const inputArgs = args._.slice(2);
  
  // separate args on package=file on files or globs
  const explicitMappings = inputArgs.filter(arg => arg.includes('='));
  const filePatterns = inputArgs.filter(arg => !arg.includes('='));
  
  // process  package=file
  const explicitInputs = explicitMappings.map(inputArg => {
    const parts = inputArg.split('=');
    const packageName = parts[0];
    const fileName = parts[1];
    let data: CoberturaJson;
    try {
      data = parser.parse(fs.readFileSync(fileName, 'utf-8')) as CoberturaJson;
    } catch (e) {
      console.log(e);
      console.log(`Unable to read file ${fileName}`);
      process.exit(1);
    }
    return {
      packageName,
      fileName,
      data,
    };
  });
  
  // process glob patterns
  const expandedFiles = expandGlobs(filePatterns);
  const implicitInputs = expandedFiles.map(fileName => {
    let data: CoberturaJson;
    try {
      data = parser.parse(fs.readFileSync(fileName, 'utf-8')) as CoberturaJson;
    } catch (e) {
      console.log(e);
      console.log(`Unable to read file ${fileName}`);
      process.exit(1);
    }

    const dirName = path.dirname(fileName);
    return {
      packageName: path.basename(dirName), // using dir as package name
      fileName,
      data,
    };
  });
  
  return [...explicitInputs, ...implicitInputs];
}
