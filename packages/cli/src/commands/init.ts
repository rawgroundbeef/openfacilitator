import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { defaultTokens, getSupportedChains } from '@openfacilitator/core';

interface InitOptions {
  name?: string;
  subdomain?: string;
  owner?: string;
}

export async function initCommand(options: InitOptions) {
  const spinner = ora('Initializing facilitator...').start();

  try {
    // Check if config already exists
    const configPath = path.join(process.cwd(), 'openfacilitator.json');
    const envPath = path.join(process.cwd(), '.env');

    try {
      await fs.access(configPath);
      spinner.warn('Configuration file already exists. Use --force to overwrite.');
      return;
    } catch {
      // File doesn't exist, continue
    }

    // Default configuration
    const config = {
      name: options.name || 'My Facilitator',
      subdomain: options.subdomain || 'my-facilitator',
      ownerAddress: options.owner || '0x0000000000000000000000000000000000000000',
      supportedChains: getSupportedChains(),
      supportedTokens: defaultTokens,
      server: {
        port: 3001,
        host: '0.0.0.0',
      },
      database: {
        path: './data/openfacilitator.db',
      },
    };

    // Write configuration file
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Write .env file
    const envContent = `# OpenFacilitator Configuration
NODE_ENV=production
PORT=${config.server.port}
HOST=${config.server.host}

# Facilitator Settings
FACILITATOR_NAME="${config.name}"
FACILITATOR_SUBDOMAIN="${config.subdomain}"
OWNER_ADDRESS="${config.ownerAddress}"

# Database
DATABASE_PATH=${config.database.path}

# Optional: Custom RPC endpoints
# BASE_RPC_URL=https://mainnet.base.org
# BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
# ETHEREUM_RPC_URL=https://eth.llamarpc.com

# Optional: Private key for settlement (encrypted)
# FACILITATOR_PRIVATE_KEY=
`;

    await fs.writeFile(envPath, envContent);

    // Create data directory
    await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });

    spinner.succeed('Facilitator initialized successfully!');

    console.log('\n' + chalk.blue('Created files:'));
    console.log(chalk.gray('  • openfacilitator.json - Configuration file'));
    console.log(chalk.gray('  • .env - Environment variables'));
    console.log(chalk.gray('  • data/ - Database directory'));

    console.log('\n' + chalk.blue('Next steps:'));
    console.log(chalk.gray('  1. Edit openfacilitator.json to configure your facilitator'));
    console.log(chalk.gray('  2. Set your owner address in .env'));
    console.log(chalk.gray('  3. Run: openfacilitator start'));

    console.log('\n' + chalk.green('For Docker deployment:'));
    console.log(chalk.gray('  docker compose up -d'));
  } catch (error) {
    spinner.fail('Failed to initialize facilitator');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
}

