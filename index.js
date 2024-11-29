const { Client, Intents, Permissions, MessageEmbed } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const config = require('./config.json');

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_PRESENCES,
    Intents.FLAGS.GUILD_MESSAGES
  ]
});

const prefix = '!';
const DATA_PATH = path.join(__dirname,'stats.json');

async function loadData() {
  try {
    const data = await fs.readFile(DATA_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return {
      statsChannels: new Map(Object.entries(parsed.statsChannels || {})),
      serverStats: new Map(Object.entries(parsed.serverStats || {}))
    };
  } catch (error) {
    console.error('Error loading data:', error);
    return {
      statsChannels: new Map(),
      serverStats: new Map()
    };
  }
}

async function saveData(statsChannels, serverStats) {
  try {
    const data = {
      statsChannels: Object.fromEntries(statsChannels),
      serverStats: Object.fromEntries(serverStats)
    };
    await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

async function resetDataFile() {
  try {
    await fs.writeFile(DATA_PATH, JSON.stringify({
      statsChannels: {},
      serverStats: {}
    }, null, 2));
  } catch (error) {
    console.error('Error resetting data file:', error);
  }
}

let statsChannels = new Map();
let serverStats = new Map();

const calculateServerStats = (guild) => {
  const textChannels = guild.channels.cache.filter(channel => 
    channel.type === 'GUILD_TEXT' || 
    channel.type === 'GUILD_NEWS'
  ).size;

  const voiceChannels = guild.channels.cache.filter(channel => 
    channel.type === 'GUILD_VOICE' || 
    channel.type === 'GUILD_STAGE_VOICE'
  ).size;

  return {
    totalMembers: guild.memberCount,
    humanMembers: guild.members.cache.filter(member => !member.user.bot).size,
    botMembers: guild.members.cache.filter(member => member.user.bot).size,
    textChannels,
    voiceChannels,
    totalChannels: textChannels + voiceChannels,
    totalRoles: guild.roles.cache.size
  };
};

const initServerStats = async (guild) => {
  if (!serverStats.has(guild.id)) {
    serverStats.set(guild.id, calculateServerStats(guild));
    await saveData(statsChannels, serverStats);
  }
};

const validateAndUpdateStats = async (guild) => {
  const currentStats = calculateServerStats(guild);
  serverStats.set(guild.id, currentStats);
  await saveData(statsChannels, serverStats);
  return currentStats;
};

const updateServerStats = async (guild) => {
  if (!guild) return;
  
  try {
    const stats = statsChannels.get(guild.id);
    if (!stats) return;

    const category = guild.channels.cache.get(stats.categoryId);
    if (!category) {
      statsChannels.delete(guild.id);
      serverStats.delete(guild.id);
      await saveData(statsChannels, serverStats);
      return;
    }

    const guildStats = await validateAndUpdateStats(guild);

    const updateChannel = async (channelId, newName) => {
      const channel = guild.channels.cache.get(channelId);
      if (channel && channel.name !== newName) {
        await channel.setName(newName).catch(console.error);
      }
    };

    await Promise.all([
      stats.all && updateChannel(stats.all, `📊 Total Members: ${guildStats.totalMembers}`),
      stats.members && updateChannel(stats.members, `👥 members: ${guildStats.humanMembers}`),
      stats.bots && updateChannel(stats.bots, `🤖 Bots: ${guildStats.botMembers}`),
      stats.channels && updateChannel(stats.channels, `📝 Channels: 💬 ${guildStats.textChannels} | 🔊 ${guildStats.voiceChannels}`),
      stats.roles && updateChannel(stats.roles, `🎭 Roles: ${guildStats.totalRoles}`)
    ].filter(Boolean));

  } catch (error) {
    console.error('Error updating server stats:', error);
  }
};

const setupStatsChannels = async (guild) => {
  try {
    const existingStats = statsChannels.get(guild.id);
    if (existingStats) {
      const category = guild.channels.cache.get(existingStats.categoryId);
      if (category) {
        return false;
      } else {
        statsChannels.delete(guild.id);
        serverStats.delete(guild.id);
      }
    }

    await initServerStats(guild);
    const guildStats = await validateAndUpdateStats(guild);

    const category = await guild.channels.create('📊 SERVER STATS', {
      type: 'GUILD_CATEGORY'
    });

    const stats = {
      categoryId: category.id
    };

    const createChannel = async (name) => {
      const channel = await guild.channels.create(name, {
        type: 'GUILD_VOICE',
        parent: category,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [Permissions.FLAGS.CONNECT]
          }
        ]
      });
      return channel.id;
    };

    stats.all = await createChannel(`📊 Total Members: ${guildStats.totalMembers}`);
    stats.members = await createChannel(`👥 members: ${guildStats.humanMembers}`);
    stats.bots = await createChannel(`🤖 Bots: ${guildStats.botMembers}`);
    stats.channels = await createChannel(`📝 Channels: 💬 ${guildStats.textChannels} | 🔊 ${guildStats.voiceChannels}`);
    stats.roles = await createChannel(`🎭 Roles: ${guildStats.totalRoles}`);

    statsChannels.set(guild.id, stats);
    await saveData(statsChannels, serverStats);
    return true;
  } catch (error) {
    console.error('Error setting up stats channels:', error);
    return false;
  }
};

const createHelpEmbed = () => {
  return new MessageEmbed()
    .setColor('#0099ff')
    .setTitle('📊 Server Statistics - Help Guide')
    .setDescription('Hello! I am a bot dedicated to displaying server statistics automatically')
    .addFields(
      { 
        name: '🛠️ Available Commands',
        value: `
          \`${prefix}help\` - Show help menu
          \`${prefix}stats-setup\` - Create statistics channels
          \`${prefix}stats-remove\` - Remove statistics channels
          \`${prefix}stats-refresh\` - Manually refresh statistics
        `
      },
      {
        name: '📝 Important Notes',
        value: `
          • Statistics are updated automatically when changes occur
          • Administrator permissions are required to use commands
          • Voice channels are for display purposes only
        `
      }
    )
    .setFooter({ text: 'Developed by Skoda®Studio' })
    .setTimestamp();
};

client.on('ready', async () => {
  console.log(`Bot is ready as ${client.user.tag}`);
  console.log(`Skoda®Studio`);
  console.log(`https://discord.gg/TX8hXhvFu6`);
  const data = await loadData();
  statsChannels = data.statsChannels;
  serverStats = data.serverStats;
  
  for (const [guildId, stats] of statsChannels) {
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      await updateServerStats(guild);
    } else {
      statsChannels.delete(guildId);
      serverStats.delete(guildId);
    }
  }
  
  await saveData(statsChannels, serverStats);
});

client.on('guildMemberAdd', async member => {
  await updateServerStats(member.guild);
});

client.on('guildMemberRemove', async member => {
  await updateServerStats(member.guild);
});

client.on('channelCreate', async channel => {
  if (channel.guild) {
    await updateServerStats(channel.guild);
  }
});

client.on('channelDelete', async channel => {
  if (channel.guild) {
    await updateServerStats(channel.guild);
  }
});

client.on('roleCreate', async role => {
  await updateServerStats(role.guild);
});

client.on('roleDelete', async role => {
  await updateServerStats(role.guild);
});

client.on('messageCreate', async message => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  switch (command) {
    case 'help':
      const helpEmbed = createHelpEmbed();
      message.reply({ embeds: [helpEmbed] });
      break;

    case 'stats-setup':
      if (!message.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
        return message.reply('❌ Sorry, this command is only available to administrators!');
      }
      
      await message.reply('⏳ Setting up statistics channels...');
      const success = await setupStatsChannels(message.guild);
      
      if (success) {
        message.reply('✅ Statistics channels created successfully! They will update automatically when changes occur.');
      } else {
        message.reply('❌ Channels already exist or an error occurred during creation!');
      }
      break;

    case 'stats-remove':
      if (!message.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
        return message.reply('❌ Sorry, this command is only available to administrators!');
      }
      
      const stats = statsChannels.get(message.guild.id);
      if (stats) {
        const category = message.guild.channels.cache.get(stats.categoryId);
        if (category) {
          const channels = message.guild.channels.cache.filter(
            channel => channel.parentId === category.id
          );
          
          await Promise.all([
            ...channels.map(channel => channel.delete()),
            category.delete()
          ]);
        }
        
        statsChannels.delete(message.guild.id);
        serverStats.delete(message.guild.id);
        await resetDataFile();
        message.reply('✅ Statistics channels removed successfully!');
      } else {
        message.reply('❌ No statistics channels found!');
      }
      break;

    case 'stats-refresh':
      if (!message.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
        return message.reply('❌ Sorry, this command is only available to administrators!');
      }
      
      await message.reply('⏳ Refreshing statistics...');
      await updateServerStats(message.guild);
      message.reply('✅ Statistics refreshed successfully!');
      break;
  }
});

client.login(config.TOKEN);