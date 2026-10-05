import { loadScript } from './aem.js';
import getPublicConfig from '../utils/config.js';

const CONDUCTRICS_BASE = 'https://client-rbc.cdn-v3.conductrics.com/ac-VyDHnrdzqf/v3/agent-api/js/f-BXnDgyehSJ';
const DEPLOY_TARGETS = {
  stage: 'dt-dHlP3MpvHEujt11xHPJ7Ejb6WkICDf',
  prod: 'dt-FuGmpoSyp9pocP3U7tW3shfK8kMD3r',
};
const PROD_HOSTS = ['main--rbc--aemsites.aem.live', 'www.rbcroyalbank.com'];

const target = PROD_HOSTS.includes(window.location.hostname)
  ? DEPLOY_TARGETS.prod
  : DEPLOY_TARGETS.stage;

getPublicConfig().then(({ conductricApiKey }) => {
  if (!conductricApiKey) return;
  loadScript(`${CONDUCTRICS_BASE}/${target}?apikey=${conductricApiKey}`, { async: true });
});
