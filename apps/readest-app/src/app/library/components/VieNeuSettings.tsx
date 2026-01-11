import React, { useState, useEffect, useMemo } from 'react';
import { HiServer, HiRefresh, HiCheckCircle, HiXCircle } from 'react-icons/hi';
import { useTranslation } from '@/hooks/useTranslation';
import { useEnv } from '@/context/EnvContext';
import { useSettingsStore } from '@/store/settingsStore';
import { saveSysSettings } from '@/helpers/settings';

interface ServerStatus {
  connected: boolean;
  modelLoaded: boolean;
  backend?: string;
  backbone?: string;
  codec?: string;
}

interface ModelConfig {
  backbones: Array<{ id: string; label: string; isGGUF: boolean }>;
  codecs: Array<{ id: string; label: string }>;
  voices: Array<{ name: string; available: boolean }>;
}

const GGUF_ALLOWED_VOICES = [
  'Vĩnh (nam miền Nam)',
  'Bình (nam miền Bắc)',
  'Ngọc (nữ miền Bắc)',
  'Đoan (nữ miền Nam)',
  'Ly (nữ miền Bắc)',
  'Tuyên (nam miền Bắc)',
];

interface VieNeuSettingsProps {
  onClose?: () => void;
}

const VieNeuSettings: React.FC<VieNeuSettingsProps> = ({ onClose }) => {
  console.log('VieNeuSettings component rendering...');

  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { settings, setSettings, saveSettings } = useSettingsStore();

  console.log('VieNeuSettings - settings:', settings);
  console.log('VieNeuSettings - settings.vieneu:', settings.vieneu);

  // Ensure vieneu settings exist with defaults
  const vieneuSettings = settings.vieneu || {
    enabled: true,
    serverUrl: '/api/tts/vieneu',
    apiKey: '',
    currentBackbone: '',
    currentCodec: '',
    connectionStatus: 'unknown',
  };

  // Local state
  const [serverUrl, setServerUrl] = useState(vieneuSettings.serverUrl || '/api/tts/vieneu');
  const [apiKey, setApiKey] = useState(vieneuSettings.apiKey || '');
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const [selectedBackbone, setSelectedBackbone] = useState(vieneuSettings.currentBackbone || '');
  const [selectedCodec, setSelectedCodec] = useState(vieneuSettings.currentCodec || '');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Fetch server status
  const checkServerStatus = async () => {
    setIsTestingConnection(true);
    setStatusMessage('');
    try {
      const response = await fetch('/api/tts/vieneu/server-status');
      const data = await response.json();
      setServerStatus(data);

      // Update settings with current status
      if (data.connected) {
        const newSettings = {
          ...settings,
          vieneu: {
            ...vieneuSettings,
            connectionStatus: 'connected' as const,
            currentBackbone: data.backbone || vieneuSettings.currentBackbone || '',
            currentCodec: data.codec || vieneuSettings.currentCodec || '',
          },
        };
        setSettings(newSettings);
        await saveSettings(envConfig, newSettings);
        setStatusMessage('✅ Connected successfully');
      } else {
        setStatusMessage('❌ Connection failed');
      }
    } catch (error) {
      setServerStatus({
        connected: false,
        modelLoaded: false,
      });
      setStatusMessage(`❌ Error: ${error instanceof Error ? error.message : 'Connection failed'}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Fetch available models
  const fetchModels = async () => {
    try {
      const response = await fetch('/api/tts/vieneu/models');
      const data = await response.json();
      setModelConfig(data);
    } catch (error) {
      console.error('Failed to fetch models:', error);
    }
  };

  // Load model
  const handleLoadModel = async () => {
    if (!selectedBackbone || !selectedCodec) {
      setStatusMessage('⚠️ Please select both backbone and codec');
      return;
    }

    setIsLoadingModel(true);
    setStatusMessage('');
    try {
      const response = await fetch('/api/tts/vieneu/load-model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VieNeu-API-Key': apiKey,
        },
        body: JSON.stringify({
          backbone: selectedBackbone,
          codec: selectedCodec,
          device: 'Auto',
          use_lmdeploy: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to load model');
      }

      const data = await response.json();
      setStatusMessage(`✅ Model loaded successfully: ${data.backbone}`);

      // Refresh server status
      await checkServerStatus();
    } catch (error) {
      setStatusMessage(
        `❌ Failed to load model: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsLoadingModel(false);
    }
  };

  // Save connection settings
  const handleSaveConnection = async () => {
    const newSettings = {
      ...settings,
      vieneu: {
        ...vieneuSettings,
        enabled: true,
        serverUrl,
        apiKey,
        currentBackbone: selectedBackbone,
        currentCodec: selectedCodec,
        connectionStatus: 'unknown' as const,
      },
    };
    setSettings(newSettings);
    await saveSettings(envConfig, newSettings);
    setStatusMessage('✅ Connection settings saved');
  };

  // Initialize
  useEffect(() => {
    console.log('VieNeuSettings mounted, initializing...');
    checkServerStatus().catch((err) => console.error('checkServerStatus error:', err));
    fetchModels().catch((err) => console.error('fetchModels error:', err));
  }, []);

  // Filter voices based on selected backbone
  const availableVoices = useMemo(() => {
    if (!modelConfig || !selectedBackbone) return [];

    const backbone = modelConfig.backbones.find((b) => b.id === selectedBackbone);
    if (!backbone) return [];

    if (backbone.isGGUF) {
      // GGUF models: only show 6 voices with samples
      return modelConfig.voices.filter((v) => GGUF_ALLOWED_VOICES.includes(v.name));
    } else {
      // Regular models: show all voices
      return modelConfig.voices;
    }
  }, [modelConfig, selectedBackbone]);

  return (
    <div className='flex flex-col gap-4 p-4'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <h2 className='flex items-center gap-2 text-2xl font-bold'>
          <HiServer className='text-primary' />
          {_('VieNeu-TTS Server Settings')}
        </h2>
        {onClose && (
          <button className='btn btn-ghost btn-sm' onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      {/* Status Message */}
      {statusMessage && (
        <div
          className={`alert ${
            statusMessage.startsWith('✅')
              ? 'alert-success'
              : statusMessage.startsWith('⚠️')
                ? 'alert-warning'
                : 'alert-error'
          }`}
        >
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Server Connection Section */}
      <div className='card bg-base-200'>
        <div className='card-body'>
          <h3 className='card-title'>{_('Server Connection')}</h3>

          {/* Status Indicator */}
          <div className='mb-4 flex items-center gap-2'>
            {serverStatus?.connected ? (
              <>
                <HiCheckCircle className='text-success' size={24} />
                <span className='text-success'>{_('Connected')}</span>
                {serverStatus.modelLoaded && (
                  <span className='badge badge-success'>{_('Model Loaded')}</span>
                )}
              </>
            ) : (
              <>
                <HiXCircle className='text-error' size={24} />
                <span className='text-error'>{_('Disconnected')}</span>
              </>
            )}
            <button
              className='btn btn-ghost btn-sm ml-auto'
              onClick={checkServerStatus}
              disabled={isTestingConnection}
            >
              <HiRefresh className={isTestingConnection ? 'animate-spin' : ''} />
              {_('Test Connection')}
            </button>
          </div>

          {/* Server URL */}
          <div className='form-control'>
            <label className='label'>
              <span className='label-text font-medium'>{_('Server URL')}</span>
            </label>
            <input
              type='text'
              placeholder='http://localhost:7860'
              className='input input-bordered'
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
            />
          </div>

          {/* API Key */}
          <div className='form-control'>
            <label className='label'>
              <span className='label-text font-medium'>{_('API Key')}</span>
            </label>
            <input
              type='password'
              placeholder={_('Enter your API key')}
              className='input input-bordered'
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <label className='label'>
              <span className='label-text-alt text-warning'>
                ⚠️ {_('API key is stored locally. Secure your system.')}
              </span>
            </label>
          </div>

          <button className='btn btn-primary' onClick={handleSaveConnection}>
            {_('Save Connection')}
          </button>
        </div>
      </div>

      {/* Model Configuration Section */}
      {serverStatus?.connected && (
        <div className='card bg-base-200'>
          <div className='card-body'>
            <h3 className='card-title'>{_('Model Configuration')}</h3>

            {/* Current Model */}
            {serverStatus.modelLoaded && (
              <div className='alert alert-info mb-4'>
                <span>
                  {_('Current Model')}: <strong>{serverStatus.backbone}</strong> +{' '}
                  {serverStatus.codec}
                </span>
              </div>
            )}

            {/* Backbone Selection */}
            <div className='form-control'>
              <label className='label'>
                <span className='label-text font-medium'>{_('Backbone Model')}</span>
              </label>
              <select
                className='select select-bordered'
                value={selectedBackbone}
                onChange={(e) => setSelectedBackbone(e.target.value)}
              >
                <option value=''>{_('Select backbone...')}</option>
                {modelConfig?.backbones.map((backbone) => (
                  <option key={backbone.id} value={backbone.id}>
                    {backbone.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Codec Selection */}
            <div className='form-control'>
              <label className='label'>
                <span className='label-text font-medium'>{_('Codec')}</span>
              </label>
              <select
                className='select select-bordered'
                value={selectedCodec}
                onChange={(e) => setSelectedCodec(e.target.value)}
              >
                <option value=''>{_('Select codec...')}</option>
                {modelConfig?.codecs.map((codec) => (
                  <option key={codec.id} value={codec.id}>
                    {codec.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Available Voices */}
            {selectedBackbone && (
              <div className='form-control'>
                <label className='label'>
                  <span className='label-text font-medium'>
                    {_('Available Voices')} ({availableVoices.length})
                  </span>
                </label>
                <div className='flex flex-wrap gap-2'>
                  {availableVoices.map((voice) => (
                    <span key={voice.name} className='badge badge-outline'>
                      {voice.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button
              className='btn btn-success'
              onClick={handleLoadModel}
              disabled={!selectedBackbone || !selectedCodec || isLoadingModel}
            >
              {isLoadingModel ? (
                <>
                  <span className='loading loading-spinner'></span>
                  {_('Loading...')}
                </>
              ) : (
                _('Load Model')
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VieNeuSettings;
