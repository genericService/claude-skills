import unittest
import os
import re

class TestSkillStructure(unittest.TestCase):
    def setUp(self):
        # We assume the test is run from the project root
        self.skills_dir = 'skills'

    def check_kebab_case(self, name, allow_underscores=False):
        # Allow dots for extensions, but main part must be kebab
        # e.g. file-name.txt is valid
        # file_name.txt is invalid (unless allow_underscores=True for .py files)
        # file-name.tar.gz is valid
        if name.startswith('.'): # Ignore hidden files like .DS_Store
            return True
            
        # Split by dot to handle extensions
        parts = name.split('.')
        stem = parts[0]
        
        if allow_underscores:
            # Python modules can use underscores (hyphens are invalid in imports)
            pattern = r'^[a-z0-9]+([_-][a-z0-9]+)*$'
        else:
            pattern = r'^[a-z0-9]+(-[a-z0-9]+)*$'
        return bool(re.match(pattern, stem))

    def check_skill_structure(self, skill_name):
        skill_path = os.path.join(self.skills_dir, skill_name)
        
        if not os.path.exists(skill_path):
            self.skipTest(f"Skill {skill_name} not found")

        # Check all files in skill directory recursively
        for root, dirs, files in os.walk(skill_path):
            # Skip __pycache__ directories (runtime artifacts)
            dirs[:] = [d for d in dirs if d != '__pycache__']

            for filename in files:
                if filename == 'SKILL.md':
                    continue
                # Allow underscores in .py files (Python modules can't use hyphens)
                is_python = filename.endswith('.py')
                rel_path = os.path.relpath(os.path.join(root, filename), self.skills_dir)
                self.assertTrue(
                    self.check_kebab_case(filename, allow_underscores=is_python),
                    f"File '{filename}' (in {rel_path}) is not kebab-case"
                )
            
            for dirname in dirs:
                self.assertTrue(self.check_kebab_case(dirname), f"Directory '{dirname}' (in {root}) is not kebab-case")

    def test_cloudflare_pages_structure(self):
        self.check_skill_structure('cloudflare-pages')

    def test_nextjs_tinacms_structure(self):
        self.check_skill_structure('nextjs-tinacms')

    def test_hugo_sveltia_cms_structure(self):
        self.check_skill_structure('hugo-sveltia-cms')

    def test_kitchen_sink_structure(self):
        self.check_skill_structure('kitchen-sink-design-system')

    def test_deep_research_structure(self):
        self.check_skill_structure('deep-research')

    def test_design_lookup_structure(self):
        self.check_skill_structure('design-lookup')

    def test_pitolandia_visual_identity_structure(self):
        self.check_skill_structure('pitolandia-visual-identity')

    def test_gmail_structure(self):
        self.check_skill_structure('gmail')

    def test_google_calendar_structure(self):
        self.check_skill_structure('google-calendar')

    def test_google_contacts_structure(self):
        self.check_skill_structure('google-contacts')

    def test_agentic_web_structure(self):
        self.check_skill_structure('agentic-web')

    def test_llms_txt_structure(self):
        self.check_skill_structure('llms-txt')
