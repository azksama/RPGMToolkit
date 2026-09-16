export type Game = {title:string;engine:string;sourceName:string;kind:'folder'|'zip';prefix:string;status:'absent'|'installed'|'disabled'|'incomplete';pluginCount:number;files:number;size:number;fingerprint:string;recoveryNeeded:boolean};
export type FolderGame = {token:string;path:string;title:string;game:Game|null;plan:'install'|'update'|'repair'|'current'|'recover'|'blocked';error:string|null;result:string};
export type State = {game:Game|null;folderMode:boolean;games:FolderGame[];scanWarnings:string[];modName:string;modSha256:string;modBytes:number;canExport:boolean;resultName:string;action:string;lastOperation?:string;lastError?:string|null};
export type Run = (command:string,args?:Record<string,unknown>,message?:string)=>Promise<State|null>;
