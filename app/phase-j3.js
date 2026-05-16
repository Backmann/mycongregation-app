const fs = require('fs');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function write(p, content) {
  fs.writeFileSync(p, content, 'utf8');
  console.log('✓', p);
}

// 1. Update import paths in moved files (depth +1: ../../../ → ../../../../)
for (const f of ['index.tsx', '[id].tsx', 'new.tsx']) {
  const p = `app/(app)/publishers/families/${f}`;
  let c = read(p);
  c = c.replace(/'\.\.\/\.\.\/\.\.\/lib/g, "'../../../../lib");
  c = c.replace(/'\.\.\/\.\.\/\.\.\/components/g, "'../../../../components");
  write(p, c);
}

// 2. Update navigation paths in moved files
for (const f of ['index.tsx', 'new.tsx']) {
  const p = `app/(app)/publishers/families/${f}`;
  let c = read(p);
  c = c.replace(/`\/families\/\$\{/g, '`/publishers/families/${');
  write(p, c);
}

// 3. Update publishers/index.tsx — FamilySectionHeader navigation
{
  const p = 'app/(app)/publishers/index.tsx';
  let c = read(p);
  c = c.replace(/`\/families\/\$\{/g, '`/publishers/families/${');
  write(p, c);
}

// 4. Update publishers/_layout.tsx
//    a) header button '/families' → '/publishers/families'
//    b) add Stack.Screen entries for nested families routes
{
  const p = 'app/(app)/publishers/_layout.tsx';
  let c = read(p);

  // 4a
  c = c.replace("'/families' as any", "'/publishers/families' as any");

  // 4b: insert before </Stack>
  const newEntries = `      <Stack.Screen
        name="families/index"
        options={{
          title: t('families.title.list'),
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/publishers/families/new' as any)}
              style={{ paddingHorizontal: 12 }}
              hitSlop={8}
            >
              <Ionicons name="add" size={28} color="#0ea5e9" />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen
        name="families/[id]"
        options={{
          title: t('families.title.detail'),
          headerLeft: () => (
            <Pressable
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace('/publishers/families' as any);
                }
              }}
              style={{ paddingHorizontal: 12 }}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={28} color="#0ea5e9" />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="families/new" options={{ title: t('families.title.new') }} />
    </Stack>`;
  c = c.replace('    </Stack>', newEntries);
  write(p, c);
}

// 5. Remove families Tabs.Screen from app/(app)/_layout.tsx
{
  const p = 'app/(app)/_layout.tsx';
  let c = read(p);
  c = c.replace(/\s*<Tabs\.Screen name="families" options=\{\{ href: null \}\} \/>\n/, '\n');
  write(p, c);
}

console.log('\n✅ Phase J.3 applied.');
