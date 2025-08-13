#!/bin/bash

echo "🔍 Extraindo HTMLs dos commits que REALMENTE têm mudanças em HTML..."

mkdir -p htmls_antigos

# Commits com mudanças reais em HTML
declare -A commits=(
    ["2024-07-01-inicial"]="2b2bac69e67c62c53fd8fa2abae4131d39d75498"
    ["2024-07-02-agendamentos"]="4f4852697f9df52880565ad5d725cd2a3b7f6d39"
    ["2024-07-04-customers"]="f08b669685b3ff124e20ad6ec61c214312b9485e"
    ["2024-07-04-widgets"]="f6c1d41aae66b3088e338feae939036986dd3b0a"
    ["2024-07-04-payments"]="82bf9579a78e01ae9f0337de498ebb80e23c00f5"
)

for date in "${!commits[@]}"; do
    commit_hash="${commits[$date]}"
    echo "📅 Processando $date - Commit: $commit_hash"
    
    date_folder="htmls_antigos/$date"
    mkdir -p "$date_folder"
    
    # Verificar se tem HTMLs
    html_count=$(git show --name-only --pretty="" "$commit_hash" | grep '\.html$' | wc -l)
    echo "📊 HTMLs encontrados: $html_count"
    
    if [ "$html_count" -gt 0 ]; then
        git show --name-only --pretty="" "$commit_hash" | grep '\.html$' | while read html_file; do
            if [ -n "$html_file" ]; then
                echo "📄 Extraindo: $html_file"
                html_dir=$(dirname "$html_file")
                mkdir -p "$date_folder/$html_dir"
                git show "$commit_hash:$html_file" > "$date_folder/$html_file" 2>/dev/null
                if [ $? -eq 0 ]; then
                    echo "✅ Extraído: $html_file"
                fi
            fi
        done
    else
        echo "❌ Nenhum HTML encontrado neste commit"
    fi
    
    echo "---"
done

echo "🎉 Extração dos commits com HTMLs concluída!"
