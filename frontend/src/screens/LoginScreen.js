import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function LoginScreen({ onNavigate }) {
  const { login } = useAuth();
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Required Fields', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      Alert.alert(
        'Login Failed',
        err.message || 'Unable to authenticate. Please check your credentials and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 44;

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.statusBarBg} />
      <KeyboardAvoidingView
        style={s.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={[s.scroll, { paddingTop: topInset }]}>
          <View style={s.topBar}>
            <TouchableOpacity onPress={() => onNavigate('landing')} style={s.backBtn}>
              <Text style={s.backBtnText}>&lt; Back</Text>
            </TouchableOpacity>
          </View>

          <View style={s.header}>
            <Text style={s.title}>Sign In</Text>
            <Text style={s.subtitle}>Enter your credentials to access your account.</Text>
          </View>

          <View style={s.form}>
            <View style={s.inputGroup}>
              <Text style={s.label}>Email Address</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="name@example.com"
                placeholderTextColor={theme.textPlaceholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Password</Text>
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor={theme.textPlaceholder}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={s.primaryBtn}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={theme.textBtnPrimary} size="small" />
              ) : (
                <Text style={s.primaryBtnText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={() => onNavigate('register')}
              activeOpacity={0.8}
            >
              <Text style={s.secondaryBtnText}>Create New Account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    keyboardView: {
      flex: 1,
    },
    scroll: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 28,
    },
    backBtn: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      backgroundColor: theme.bgBtnSecondary,
    },
    backBtnText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    header: {
      marginBottom: 24,
      borderBottomWidth: 2,
      borderBottomColor: theme.border,
      paddingBottom: 12,
    },
    title: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '800',
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 13,
      marginTop: 4,
    },
    form: {
      gap: 16,
    },
    inputGroup: {
      gap: 6,
    },
    label: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: theme.text,
      backgroundColor: theme.bgInput,
    },
    primaryBtn: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
    },
    primaryBtnText: {
      color: theme.textBtnPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    secondaryBtn: {
      backgroundColor: theme.bgBtnSecondary,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 14,
      alignItems: 'center',
    },
    secondaryBtnText: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '600',
    },
  });
}
