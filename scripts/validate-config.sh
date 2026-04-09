#!/bin/bash

# Configuration Validation Script
# Checks that all required configuration files are set up correctly
# and that the project builds successfully.
#
# Note: This script treats test failures as warnings, not errors.
# Configuration can be valid even if tests are failing.

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   Configuration Validation                                ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

ERRORS=0
WARNINGS=0

# Check if env.ts exists
info "Checking environment configuration..."

if [ ! -f "code/env.ts" ]; then
    error "code/env.ts not found!"
    echo "   Copy code/env.sample.ts to code/env.ts and fill in your values."
    ERRORS=$((ERRORS + 1))
else
    success "code/env.ts found"
fi

# Check if .root-config.json exists
if [ ! -f ".root-config.json" ]; then
    error ".root-config.json not found!"
    echo "   Copy .root-config.sample.json to .root-config.json and configure."
    ERRORS=$((ERRORS + 1))
else
    success ".root-config.json found"
    
    # Validate .root-config.json content
    if grep -q "cm_placeholder" .root-config.json; then
        warning ".root-config.json contains template placeholder values"
        echo "   Update collectionModuleKey with your actual module key."
        WARNINGS=$((WARNINGS + 1))
    fi
    
    if grep -q "00000000-0000-0000-0000-000000000001" .root-config.json; then
        warning ".root-config.json contains placeholder organization ID"
        echo "   Update organizationId with your actual Root organization ID."
        WARNINGS=$((WARNINGS + 1))
    fi
fi

# Check for placeholder values in env.ts
if [ -f "code/env.ts" ]; then
    info "Checking for placeholder values..."
    
    PLACEHOLDERS=(
        "xxxxx"
        "cm_placeholder"
    )
    
    for PLACEHOLDER in "${PLACEHOLDERS[@]}"; do
        if grep -q "$PLACEHOLDER" code/env.ts; then
            warning "Found placeholder value in code/env.ts: $PLACEHOLDER"
            echo "   Replace with actual API keys and configuration values."
            WARNINGS=$((WARNINGS + 1))
        fi
    done
fi

# Check TypeScript compilation
info "Checking TypeScript compilation..."
if npm run build > /dev/null 2>&1; then
    success "TypeScript compilation successful"
else
    error "TypeScript compilation failed"
    echo "   Run 'npm run build' to see detailed errors."
    ERRORS=$((ERRORS + 1))
fi

# Check linting
info "Checking linting..."
if npm run lint > /dev/null 2>&1; then
    success "Linting passed"
else
    warning "Linting failed"
    echo "   Run 'npm run lint' to see detailed errors."
    echo "   Run 'npm run lint:fix' to auto-fix some issues."
    WARNINGS=$((WARNINGS + 1))
fi

# Run tests (non-blocking for configuration validation)
info "Running tests..."
if npm test > /dev/null 2>&1; then
    success "All tests passed"
else
    warning "Tests failed"
    echo "   Run 'npm test' to see detailed errors."
    echo "   Note: Test failures don't prevent deployment, but should be fixed."
    WARNINGS=$((WARNINGS + 1))
fi

# Check Node version
info "Checking Node version..."
if [ -f ".nvmrc" ]; then
    REQUIRED_VERSION=$(cat .nvmrc)
    CURRENT_VERSION=$(node -v | sed 's/v//')
    
    if [[ "$CURRENT_VERSION" == "$REQUIRED_VERSION"* ]]; then
        success "Node version $CURRENT_VERSION matches requirement"
    else
        warning "Node version mismatch"
        echo "   Required: $REQUIRED_VERSION"
        echo "   Current:  $CURRENT_VERSION"
        echo "   Run 'nvm use' to switch to the correct version."
        WARNINGS=$((WARNINGS + 1))
    fi
fi

# Summary
echo ""
echo "─────────────────────────────────────────────────────────────"
echo "  Validation Summary"
echo "─────────────────────────────────────────────────────────────"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    success "All checks passed! No errors or warnings."
    echo ""
    echo "You're ready to:"
    echo "  - Deploy to sandbox: npm run deploy:sandbox"
    echo "  - Deploy to production: npm run deploy:production"
    echo ""
    exit 0
elif [ $ERRORS -eq 0 ]; then
    warning "Configuration is valid but with $WARNINGS warning(s)."
    echo ""
    echo "Review warnings above. You can still deploy, but consider fixing them."
    echo ""
    exit 0
else
    error "Configuration has $ERRORS critical error(s) and $WARNINGS warning(s)."
    echo ""
    echo "Fix the critical errors above before deploying."
    echo "Note: Warnings won't block deployment but should be addressed."
    echo ""
    exit 1
fi

