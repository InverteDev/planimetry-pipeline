declare module "deploy_config"{
    export interface DeployConfig {
        playcanvas: {
            project_id: number;
            project_name: string;
            branch_id?: string;
        }
        html_modify: {
            cdn_url: string;
            modify_indexhtml: boolean;
            title: string;
        }
        sftp: {
            remote_path: `html/${string}`;
        }
    }
}

